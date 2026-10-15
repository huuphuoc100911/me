#!/usr/bin/env node
/**
 * Video ngan dang story / Reels ngay 18/10 — cac khoanh khac dep nhat cua phim hoat hinh, moi canh ~2,4 giay,
 * chuyen canh hoa tan (dissolve) 0,6 giay, cuoi video la man "1 nam" giua bau troi sao hinh trai tim
 * (chu hien tung lop, hai dua di xa dan, mo dan ve den cung nhac). Tong ~21 giay.
 *
 *   npm run videongan     # -> video/mot-nam-ngan.mp4 (co nhac) + video/mot-nam-ngan-khong-nhac.mp4
 *                         #    + video/mot-nam-ngan.webp (anh bia)
 *
 * Ban khong nhac de gan nhac ngay trong Instagram / TikTok (nhac tu tai len hay bi tat tieng).
 * Ve bang chinh trang chuyen-cua-chung-minh.html (?xuat) nhu tools/hoat-hinh.js; hoa tan = chup 2 khung
 * (canh cu + canh moi) roi tron pixel bang sharp — khong dung chop trang (nguoi dung che "giat").
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
const SHOT_MS = 2400;        // moi canh
const XF_MS = 600;           // hoa tan giua 2 canh (chong len nhau)
const FADE_IN_MS = 500;      // mo dau tu den
// Man cuoi: vao canh 'ket' luc sao bat dau bay ve hinh trai tim (400ms), dai 7 giay:
// chu hien tung lop -> trai tim sao hoan tat (~4,1s) -> hai dua di xa (tu 4,8s) -> mo dan ve den
const END = { art: 'ket', at: 600, ms: 7000, fadeOut: 1300 };
const END_TEXT = {
  small: '18.10.2025 — 18.10.2026', big: '1 năm', names: 'Thị Huyền ❤️ Hữu Phước',
  last: 'Năm thứ hai, mình viết tiếp nhé ❤️',
};
const MUSIC_FROM = null;     // giay bat dau doan nhac; null = tu tim doan soi noi nhat cua bai

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'chuyen-cua-chung-minh.html');
const OUT = path.join(ROOT, 'video', 'mot-nam-ngan.mp4');
const OUT_MUTE = path.join(ROOT, 'video', 'mot-nam-ngan-khong-nhac.mp4');
const POSTER = path.join(ROOT, 'video', 'mot-nam-ngan.webp');      // anh bia cho trang qua-nho.html
const FPS = 30;

// chu man cuoi + zoom nhe + lop toi — chen vao trang phim luc xuat
const INJECT = `(() => {
  const st = document.createElement('style');
  st.textContent = \`
    .say, .dots { display: none !important; }
    .head { top: 92px; }
    #end { position: absolute; left: 0; right: 0; top: 150px; z-index: 6; text-align: center; color: #fff; }
    #end > * { display: block; opacity: 0; }
    #end small { font: 600 17px/1 Inter; letter-spacing: 3px; color: #ffc6d5; }
    #end b { margin-top: 4px; font: 700 150px/1.1 'Dancing Script'; text-shadow: 0 0 30px rgba(255,107,138,0.75), 0 4px 18px rgba(0,0,0,0.4); }
    #end span { margin-top: 2px; font: 700 38px/1.2 'Dancing Script'; color: #ffe3ea; }
    #end2 { position: absolute; left: 24px; right: 24px; top: 772px; z-index: 6; text-align: center; opacity: 0;
      font: 700 34px/1.25 'Dancing Script'; color: #ffe3ea; text-shadow: 0 2px 14px rgba(0,0,0,0.6), 0 0 22px rgba(255,107,138,0.5); }\`;
  document.head.appendChild(st);
  const stage = document.getElementById('stage');
  stage.insertAdjacentHTML('beforeend', '<div id="end"><small>${END_TEXT.small}</small><b>${END_TEXT.big}</b><span>${END_TEXT.names}</span></div><div id="end2">${END_TEXT.last}</div>');
  const $ = (id) => document.getElementById(id);
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const inUp = (el, p, dy) => { el.style.opacity = p.toFixed(3); el.style.transform = 'translateY(' + ((1 - ease(p)) * dy).toFixed(1) + 'px)'; };
  // zoom: day may; e1..e4: 0..1 muc hien cua 4 dong chu; veil: lop den
  window.fx = ({ zoom, e1, e2, e3, e4, veil }) => {
    stage.style.transformOrigin = '50% 55%';
    stage.style.transform = 'scale(' + zoom.toFixed(4) + ')';
    const end = $('end');
    inUp(end.children[0], e1, 14);
    const big = end.children[1];
    big.style.opacity = e2.toFixed(3); big.style.transform = 'scale(' + (0.82 + 0.18 * ease(e2)).toFixed(3) + ')';
    inUp(end.children[2], e3, 16);
    inUp($('end2'), e4, 18);
    $('head').style.visibility = (e1 > 0 || e2 > 0) ? 'hidden' : '';
    $('veil').style.opacity = veil.toFixed(3);
  };
  return true;
})()`;

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const eio = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);   // ease in-out (hoa tan)

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

/** Tron 2 khung JPEG: b de len a voi do dam `alpha` (0 = a, 1 = b) -> JPEG */
async function blend(a, b, alpha) {
  const A = await sharp(a).raw().toBuffer({ resolveWithObject: true });
  const B = await sharp(b).raw().toBuffer();
  const out = Buffer.allocUnsafe(A.data.length);
  const k = Math.round(alpha * 256), j = 256 - k;
  for (let i = 0; i < out.length; i++) out[i] = (A.data[i] * j + B[i] * k) >> 8;
  return sharp(out, { raw: { width: A.info.width, height: A.info.height, channels: A.info.channels } }).jpeg({ quality: 92 }).toBuffer();
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
    await ev(`document.fonts.load('700 150px "Dancing Script"', ${JSON.stringify(END_TEXT.big + END_TEXT.names + END_TEXT.last)})`);
    const book = await ev('window.BOOK');
    const by = (a) => { const s = book.find((x) => x.art === a); if (!s) throw new Error('khong co canh ' + a); return s; };

    // Lich: moi doan (segment) = [bat dau trong video, dai, thoi diem trong phim]; doan sau bat dau som XF_MS
    // de hoa tan voi doan truoc
    const segs = [];
    let at = 0;
    SHOTS.forEach((sh, k) => {
      const s = by(sh.art), from = (sh.anh && s.photoAt != null ? s.photoAt : 0) + sh.at;
      segs.push({ start: at, ms: SHOT_MS, t0: s.start + Math.min(from, s.dur - SHOT_MS - 500), zoomIn: k % 2 === 0 });
      at += SHOT_MS - XF_MS;
    });
    const ket = by(END.art);
    segs.push({ start: at, ms: END.ms, t0: ket.start + END.at, end: true });
    const total = at + END.ms;
    const frames = Math.round((total / 1000) * FPS), secs = frames / FPS;
    const from = MUSIC_FROM != null ? MUSIC_FROM : loudest(ffmpeg, song, secs);
    console.log(`  Video ${secs.toFixed(1)} giay (${SHOTS.length} canh x ${SHOT_MS / 1000}s, hoa tan ${XF_MS}ms, man "1 nam" ${END.ms / 1000}s), nhac tu giay ${from}`);

    const fadeOutS = (END.fadeOut / 1000 + 0.4).toFixed(2);
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-ss', String(from), '-i', song,
      '-filter_complex', `[1:a]atrim=0:${secs.toFixed(2)},afade=t=in:d=0.3,afade=t=out:st=${(secs - fadeOutS).toFixed(2)}:d=${fadeOutS}[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', secs.toFixed(2), OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, bad) => ff.on('close', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg loi ' + c)))));

    /** Hieu ung + thoi diem phim cua doan `sg` tai giay thu `lt` (ms) trong doan */
    const frameOf = (sg, lt) => {
      const q = clamp01(lt / sg.ms);
      const fx = { zoom: 1, e1: 0, e2: 0, e3: 0, e4: 0, veil: 0 };
      if (sg.end) {
        fx.e1 = clamp01((lt - 700) / 600);
        fx.e2 = clamp01((lt - 1150) / 900);
        fx.e3 = clamp01((lt - 2200) / 700);
        fx.e4 = clamp01((lt - 3600) / 800);
        fx.veil = clamp01((lt - (sg.ms - END.fadeOut)) / END.fadeOut);
      } else {
        fx.zoom = sg.zoomIn ? 1 + 0.05 * q : 1.05 - 0.05 * q;              // day may vao / lui ra xen ke
        if (sg === segs[0]) fx.veil = 1 - clamp01(lt / FADE_IN_MS);
      }
      return { t: sg.t0 + lt, fx };
    };
    const capture = async ({ t, fx }) => {
      // ve khung truoc (renderAt tu dat lop toi), roi moi chong hieu ung len
      await ev(`(() => { const done = renderAt(${t.toFixed(2)}); fx(${JSON.stringify(fx)}); return done; })()`);
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      return Buffer.from(r.result.data, 'base64');
    };

    let k = 0, blended = 0;
    for (let f = 0; f < frames; f++) {
      const ms = (f * 1000) / FPS;
      while (k < segs.length - 1 && ms >= segs[k + 1].start) k++;
      const sg = segs[k], lt = ms - sg.start;
      let jpg;
      if (k > 0 && lt < XF_MS) {                                           // dang hoa tan: canh cu mo di, canh moi hien ra
        const prev = segs[k - 1];
        const a = await capture(frameOf(prev, ms - prev.start));
        const b = await capture(frameOf(sg, lt));
        jpg = await blend(a, b, eio(lt / XF_MS)); blended++;
      } else jpg = await capture(frameOf(sg, lt));
      if (!ff.stdin.write(jpg)) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (f % FPS === 0 || f === frames - 1) process.stdout.write(`\r  ${String(f + 1).padStart(4)}/${frames} khung (${blended} khung hoa tan)   `);
    }
    ff.stdin.end();
    await done;
    // ban khong nhac: chep nguyen hinh, bo tieng
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', OUT, '-an', '-c:v', 'copy', '-movflags', '+faststart', OUT_MUTE]);
    // anh bia: man "1 nam" luc chu da hien du, truoc khi mo dan ve den
    const posterAt = (segs[segs.length - 1].start + 4600) / 1000;
    const jpg = execFileSync(ffmpeg, ['-loglevel', 'error', '-ss', posterAt.toFixed(2), '-i', OUT, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-']);
    await sharp(jpg).resize({ width: 540 }).webp({ quality: 80 }).toFile(POSTER);
    const mb = (f) => (fs.statSync(f).size / 1048576).toFixed(1);
    console.log(`\n  Da ghi ${path.relative(ROOT, OUT)} (${mb(OUT)} MB) + ${path.relative(ROOT, OUT_MUTE)} (${mb(OUT_MUTE)} MB)`);
  } finally { page.close(); }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
