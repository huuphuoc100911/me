#!/usr/bin/env node
/**
 * Video 15 giay dang story / Reels ngay 18/10 — cat nhanh cac khoanh khac dep nhat cua
 * phim hoat hinh, cuoi video hien chu "1 nam" giua bau troi sao hinh trai tim.
 *
 *   npm run videongan     # -> video/mot-nam-15s.mp4 (co nhac) + video/mot-nam-15s-khong-nhac.mp4
 *                         #    + video/mot-nam-15s.webp (anh bia)
 *
 * Ban khong nhac de gan nhac ngay trong Instagram / TikTok (nhac tu tai len hay bi tat tieng).
 * Ve bang chinh trang chuyen-cua-chung-minh.html (?xuat) nhu tools/hoat-hinh.js.
 */
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync, spawnSync } = require('child_process');
const sharp = require('sharp');
const { openChrome } = require('./chrome.js');
const { findFfmpeg } = require('./hoat-hinh.js');

// ★ Cac canh cat vao (theo thu tu): art = canh trong STORY, at = mili giay tinh tu dau canh,
//   hoac tu luc anh that bay vao neu co `anh: true`
const SHOTS = [
  { art: 'hien-mau', at: 300, anh: true },
  { art: 'to-tinh', at: 2500 },
  { art: 'sinh-nhat-em', at: 50, anh: true },
  { art: 'giang-sinh', at: 1200, anh: true },
  { art: 'valentine', at: 1900, anh: true },
  { art: 'tet', at: 600, anh: true },
  { art: 'sinh-nhat-anh', at: 1700, anh: true },
  { art: 'ky-niem', at: 1900 },
];
const SHOT_MS = 1400;
const END = { art: 'ket', at: 2400, ms: 3800 };          // man cuoi "1 nam"
const MUSIC_FROM = null;     // giay bat dau doan nhac; null = tu tim doan soi noi nhat cua bai
const TEXT = { small: '18.10.2025 — 18.10.2026', big: '1 năm', names: 'Thị Huyền ❤️ Hữu Phước' };

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'chuyen-cua-chung-minh.html');
const OUT = path.join(ROOT, 'video', 'mot-nam-15s.mp4');
const OUT_MUTE = path.join(ROOT, 'video', 'mot-nam-15s-khong-nhac.mp4');
const POSTER = path.join(ROOT, 'video', 'mot-nam-15s.webp');      // anh bia cho trang qua-nho.html
const FPS = 30;

// chu man cuoi + chop trang khi chuyen canh + zoom nhe — chen vao trang phim luc xuat
const INJECT = `(() => {
  const st = document.createElement('style');
  st.textContent = \`
    .say, .dots { display: none !important; }
    .head { top: 92px; }
    #cut { position: absolute; inset: 0; z-index: 7; background: #fff; pointer-events: none; opacity: 0; }
    #end { position: absolute; left: 0; right: 0; top: 150px; z-index: 6; text-align: center; color: #fff; opacity: 0; }
    #end small { display: block; font: 600 17px/1 Inter; letter-spacing: 3px; color: #ffc6d5; }
    #end b { display: block; margin-top: 4px; font: 700 150px/1.1 'Dancing Script'; text-shadow: 0 0 30px rgba(255,107,138,0.75), 0 4px 18px rgba(0,0,0,0.4); }
    #end span { display: block; margin-top: 2px; font: 700 38px/1.2 'Dancing Script'; color: #ffe3ea; }\`;
  document.head.appendChild(st);
  const stage = document.getElementById('stage');
  stage.insertAdjacentHTML('beforeend', '<div id="cut"></div><div id="end"><small>${TEXT.small}</small><b>${TEXT.big}</b><span>${TEXT.names}</span></div>');
  window.fx = ({ zoom, cut, end, endIn, veil }) => {
    stage.style.transformOrigin = '50% 55%';
    stage.style.transform = 'scale(' + zoom.toFixed(4) + ')';
    document.getElementById('cut').style.opacity = cut.toFixed(3);
    const e = document.getElementById('end');
    e.style.opacity = end.toFixed(3);
    e.style.transform = 'translateY(' + ((1 - endIn) * 26).toFixed(1) + 'px) scale(' + (0.9 + 0.1 * endIn).toFixed(3) + ')';
    document.getElementById('head').style.visibility = end > 0 ? 'hidden' : '';
    document.getElementById('veil').style.opacity = veil.toFixed(3);
  };
  return true;
})()`;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const eo = (p) => 1 - Math.pow(1 - p, 3);

/** Doan nhac soi noi nhat (to nhat trung binh) dai `secs` giay -> giay bat dau */
function loudest(ffmpeg, song, secs) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-i', song, '-af', 'aresample=8000,asetnsamples=4000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-'], { encoding: 'utf8' });
  const rms = [...(r.stderr || '').matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === '-inf' ? -90 : +m[1]));
  const win = Math.round(secs * 2);                  // moi muc 0.5 giay
  let best = 0, bestAt = 0;
  for (let i = 0; i + win <= rms.length; i++) {
    const avg = rms.slice(i, i + win).reduce((a, b) => a + b, 0) / win;
    if (i === 0 || avg > best) { best = avg; bestAt = i / 2; }
  }
  return bestAt;
}

async function main() {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error('khong tim thay ffmpeg');
  const song = path.join(ROOT, (fs.readFileSync(PAGE, 'utf8').match(/const SONG = '([^']+)'/) || [])[1] || '');
  if (!fs.existsSync(song)) throw new Error('khong thay file nhac ' + song);

  const page = await openChrome({ width: 540, height: 960, scale: 2 });
  const { send, ev } = page;
  process.on('SIGINT', () => { page.close(); process.exit(1); });
  try {
    if (!(await page.goto('file://' + PAGE + '?xuat', 'window.READY === true'))) throw new Error('trang chua san sang (font / anh chua tai xong?)');
    await ev(INJECT);
    await ev(`document.fonts.load('700 150px "Dancing Script"', ${JSON.stringify(TEXT.big + TEXT.names)})`);
    const book = await ev('window.BOOK');
    const by = (a) => { const s = book.find((x) => x.art === a); if (!s) throw new Error('khong co canh ' + a); return s; };
    // lich: moi khung -> thoi diem trong phim
    const plan = [];
    for (const sh of SHOTS) {
      const s = by(sh.art), from = (sh.anh && s.photoAt != null ? s.photoAt : 0) + sh.at;
      plan.push({ t0: s.start + Math.min(from, s.dur - SHOT_MS - 500), ms: SHOT_MS });
    }
    const ket = by(END.art);
    plan.push({ t0: ket.start + END.at, ms: END.ms, end: true });
    const total = plan.reduce((n, p) => n + p.ms, 0);
    const frames = Math.round((total / 1000) * FPS), secs = frames / FPS;
    const from = MUSIC_FROM != null ? MUSIC_FROM : loudest(ffmpeg, song, secs);
    console.log(`  Video ${secs.toFixed(1)} giay (${plan.length - 1} canh + man "1 nam"), nhac tu giay ${from}`);

    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-ss', String(from), '-i', song,
      '-filter_complex', `[1:a]atrim=0:${secs.toFixed(2)},afade=t=in:d=0.25,afade=t=out:st=${(secs - 1.4).toFixed(2)}:d=1.4[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', secs.toFixed(2), OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, bad) => ff.on('close', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg loi ' + c)))));

    let acc = 0, k = 0;
    for (let f = 0; f < frames; f++) {
      const ms = (f * 1000) / FPS;
      while (k < plan.length - 1 && ms >= acc + plan[k].ms) { acc += plan[k].ms; k++; }
      const p = plan[k], lt = ms - acc, q = lt / p.ms;
      const fx = {
        zoom: p.end ? 1 : 1.0 + 0.045 * q,                                     // day may nhe vao trong moi canh
        cut: k > 0 ? 0.6 * (1 - clamp01(lt / 170)) : 0,                        // chop trang luc chuyen canh
        end: p.end ? clamp01((lt - 250) / 700) : 0,
        endIn: p.end ? eo(clamp01((lt - 250) / 900)) : 0,
        veil: k === 0 ? 1 - clamp01(lt / 300) : p.end ? clamp01((lt - (p.ms - 450)) / 450) : 0,
      };
      // ve khung truoc (renderAt tu dat lop toi), roi moi chong hieu ung len
      await ev(`(() => { const done = renderAt(${(p.t0 + lt).toFixed(2)}); fx(${JSON.stringify(fx)}); return done; })()`);
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      if (!ff.stdin.write(Buffer.from(r.result.data, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (f % FPS === 0 || f === frames - 1) process.stdout.write(`\r  ${String(f + 1).padStart(4)}/${frames} khung   `);
    }
    ff.stdin.end();
    await done;
    // ban khong nhac: chep nguyen hinh, bo tieng
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', OUT, '-an', '-c:v', 'copy', '-movflags', '+faststart', OUT_MUTE]);
    // anh bia: khung man "1 nam"
    const jpg = execFileSync(ffmpeg, ['-loglevel', 'error', '-ss', (secs - 1.2).toFixed(2), '-i', OUT, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']);
    await sharp(jpg).resize({ width: 540 }).webp({ quality: 80 }).toFile(POSTER);
    const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
    console.log(`\n  Da ghi ${path.relative(ROOT, OUT)} (${mb(OUT)} MB) + ${path.relative(ROOT, OUT_MUTE)} (${mb(OUT_MUTE)} MB)`);
  } finally { page.close(); }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
