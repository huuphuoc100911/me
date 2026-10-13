#!/usr/bin/env node
/**
 * Xuat phim hoat hinh chuyen-cua-chung-minh.html thanh file MP4 doc 1080x1920
 * (gui Zalo, dang story):
 *
 *   npm run hoathinh        # -> video/chuyen-cua-chung-minh.mp4
 *
 * Sua loi ke (STORY o dau trang) xong chay lai lenh nay. Video nao co trong STORY thi
 * tu cat 1 doan 6 giay nho (video/clips/) de chay trong khung anh. Cach lam: mo trang bang
 * Chrome khong giao dien (?xuat), ve tung khung bang renderAt(t), chup lai roi dua
 * thang vao ffmpeg ghep voi nhac phim. Can Google Chrome + ffmpeg (nhu tools/gallery.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'chuyen-cua-chung-minh.html');
const OUT = path.join(ROOT, 'video', 'chuyen-cua-chung-minh.mp4');
const CLIPS = path.join(ROOT, 'video', 'clips');
const CLIP_FROM = 1, CLIP_S = 6;     // bo 1 giay dau, lay 6 giay
const FPS = 30;
const CHROME = process.env.CHROME || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');

function findFfmpeg() {
  try { return execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim(); } catch {
    const bin = path.join(ROOT, 'yt-playlist-mp3/.venv/lib/python3.12/site-packages/static_ffmpeg/bin');
    return [`${process.platform}_${process.arch}`, process.platform].map((d) => path.join(bin, d, 'ffmpeg')).find((f) => fs.existsSync(f)) || null;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cat doan 6 giay (360px, khong tieng) cho moi video trong STORY — trang web va MP4 deu dung */
function makeClips(ffmpeg) {
  const html = fs.readFileSync(PAGE, 'utf8');
  const story = html.slice(html.indexOf('const STORY'), html.indexOf('const SONG'));
  const vids = [...new Set([...story.matchAll(/'([^']+\.(?:mp4|mov|webm))'/gi)].map((m) => m[1]))];
  fs.mkdirSync(CLIPS, { recursive: true });
  let made = 0;
  for (const f of vids) {
    const src = path.join(ROOT, 'images', 'love', f);
    const out = path.join(CLIPS, f.replace(/\.[^.]+$/, '') + '.mp4');
    if (!fs.existsSync(src)) { console.warn(`  ! Khong thay images/love/${f}`); continue; }
    if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', String(CLIP_FROM), '-i', src, '-t', String(CLIP_S), '-an',
      '-vf', 'scale=360:-2:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-g', '15',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    made++;
  }
  // doan cat khong con video nao dung -> xoa
  const keep = new Set(vids.map((f) => f.replace(/\.[^.]+$/, '') + '.mp4'));
  fs.readdirSync(CLIPS).filter((f) => f.endsWith('.mp4') && !keep.has(f)).forEach((f) => fs.rmSync(path.join(CLIPS, f)));
  console.log(`  Anh dong tu video: ${vids.length} doan (cat moi ${made})`);
}

async function main() {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) throw new Error('khong tim thay ffmpeg');
  // bai nhac lay tu chinh trang (SONG = '...')
  const song = path.join(ROOT, (fs.readFileSync(PAGE, 'utf8').match(/const SONG = '([^']+)'/) || [])[1] || '');
  if (!fs.existsSync(song)) throw new Error('khong thay file nhac ' + song);
  makeClips(ffmpeg);

  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'hoathinh-'));
  const chrome = spawn(CHROME, ['--headless=new', '--mute-audio', '--hide-scrollbars', '--remote-debugging-port=0',
    '--user-data-dir=' + prof, '--allow-file-access-from-files', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} fs.rmSync(prof, { recursive: true, force: true }); };
  process.on('SIGINT', () => { cleanup(); process.exit(1); });
  try {
    // cong debug Chrome tu chon -> doc tu dong "DevTools listening on ws://..."
    const wsUrl = await new Promise((ok, bad) => {
      let buf = '';
      chrome.stderr.on('data', (d) => { buf += d; const m = buf.match(/ws:\/\/[^\s]+/); if (m) ok(m[0]); });
      setTimeout(() => bad(new Error('Chrome khong mo duoc')), 15000);
    });
    const port = new URL(wsUrl).port;
    const tgt = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(tgt.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r));
    let id = 0; const wait = new Map();
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } });
    const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 540, height: 960, deviceScaleFactor: 2, mobile: false });
    await send('Page.navigate', { url: 'file://' + PAGE + '?xuat' });
    for (let i = 0; i < 150 && !(await ev('window.READY === true')); i++) await sleep(200);
    if (!(await ev('window.READY === true'))) throw new Error('trang chua san sang (font / anh chua tai xong?)');
    const total = await ev('TOTAL');
    const frames = Math.ceil((total / 1000) * FPS);
    const secs = frames / FPS;
    console.log(`  Phim ${secs.toFixed(1)} giay, ${frames} khung hinh 1080x1920 @${FPS}fps`);

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-i', song,
      '-filter_complex', `[1:a]atrim=0:${secs.toFixed(2)},afade=t=in:d=1.2,afade=t=out:st=${(secs - 3.5).toFixed(2)}:d=3.5[a]`,
      '-map', '0:v', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', secs.toFixed(2), OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((ok, bad) => ff.on('close', (c) => (c === 0 ? ok() : bad(new Error('ffmpeg loi ' + c)))));

    const t0 = Date.now();
    for (let f = 0; f < frames; f++) {
      await ev(`renderAt(${((f * 1000) / FPS).toFixed(2)})`);
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      if (!ff.stdin.write(Buffer.from(r.result.data, 'base64'))) await new Promise((ok) => ff.stdin.once('drain', ok));
      if (f % FPS === 0 || f === frames - 1) {
        const el = (Date.now() - t0) / 1000, left = (el / (f + 1)) * (frames - f - 1);
        process.stdout.write(`\r  ${String(f + 1).padStart(5)}/${frames} khung · con ~${Math.ceil(left)}s   `);
      }
    }
    ff.stdin.end();
    await done;
    ws.close();
    const mb = fs.statSync(OUT).size / 1048576;
    console.log(`\n  Da ghi ${path.relative(ROOT, OUT)} (${mb.toFixed(1)} MB)`);
  } finally { cleanup(); }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
