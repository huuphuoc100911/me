#!/usr/bin/env node
/**
 * Quet thu muc anh/video -> tao ban thu nho + ghi danh sach ra images.json
 *
 *   node tools/gallery.js          # chi xu ly file moi
 *   node tools/gallery.js --force  # lam lai tat ca
 *
 * Trang web doc images.json nen chi can tha file vao thu muc roi chay lenh nay,
 * khong phai sua code nua.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'images', 'love');
const THUMBS = path.join(DIR, 'thumbs');
const MANIFEST = path.join(DIR, 'images.json');

const THUMB_WIDTH = 700;     // du net cho luoi 3 cot tren man hinh retina
const THUMB_QUALITY = 72;
const FORCE = process.argv.includes('--force');

const isVideo = (f) => /\.(mp4|webm|mov)$/i.test(f);
const isImage = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f);

/** ffmpeg he thong, khong co thi muon binary cua yt-playlist-mp3 */
function findFfmpeg() {
  try {
    return execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
  } catch {
    const local = path.join(ROOT, 'yt-playlist-mp3/.venv/lib/python3.12/site-packages/static_ffmpeg/bin/linux/ffmpeg');
    return fs.existsSync(local) ? local : null;
  }
}

async function imageEntry(file, ffmpeg) {
  const src = path.join(DIR, file);
  const thumb = path.join(THUMBS, file.replace(/\.[^.]+$/, '') + '.webp');
  const meta = await sharp(src).metadata();
  if (FORCE || !fs.existsSync(thumb)) {
    await sharp(src).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY }).toFile(thumb);
  }
  return { f: file, t: 'img', w: meta.width, h: meta.height, thumb: path.basename(thumb) };
}

async function videoEntry(file, ffmpeg) {
  const src = path.join(DIR, file);
  const thumb = path.join(THUMBS, file.replace(/\.[^.]+$/, '') + '.webp');
  let w = 0, h = 0;

  if (ffmpeg && (FORCE || !fs.existsSync(thumb))) {
    const raw = path.join(THUMBS, '.tmp-frame.png');
    try {
      // lay khung hinh giay thu 1 lam anh dai dien
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '1', '-i', src, '-frames:v', '1', raw], { stdio: 'pipe' });
      await sharp(raw).resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY }).toFile(thumb);
      fs.rmSync(raw, { force: true });
    } catch {
      fs.rmSync(raw, { force: true });
    }
  }
  if (fs.existsSync(thumb)) {
    const m = await sharp(thumb).metadata();
    w = m.width; h = m.height;
  }
  return { f: file, t: 'vid', w, h, thumb: fs.existsSync(thumb) ? path.basename(thumb) : null };
}

async function main() {
  fs.mkdirSync(THUMBS, { recursive: true });
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) console.warn('! Khong tim thay ffmpeg — video se khong co anh dai dien');

  const files = fs.readdirSync(DIR).filter((f) => isImage(f) || isVideo(f)).sort();
  const entries = [];
  let made = 0;

  for (const file of files) {
    const before = fs.readdirSync(THUMBS).length;
    const entry = isVideo(file) ? await videoEntry(file, ffmpeg) : await imageEntry(file, ffmpeg);
    if (fs.readdirSync(THUMBS).length > before) made++;
    entries.push(entry);
    process.stdout.write(`\r  ${entries.length}/${files.length} ${file.slice(0, 44).padEnd(46)}`);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(entries, null, 0));

  const sizeOf = (d, list) => list.reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
  const origMB = sizeOf(DIR, files) / 1048576;
  const thumbMB = sizeOf(THUMBS, fs.readdirSync(THUMBS)) / 1048576;
  const imgs = entries.filter((e) => e.t === 'img').length;

  console.log(`\n\n  ${entries.length} muc (${imgs} anh, ${entries.length - imgs} video) — tao moi ${made} ban thu nho`);
  console.log(`  Goc ${origMB.toFixed(0)} MB  ->  luoi hien thi ${thumbMB.toFixed(1)} MB  (nhe hon ${(origMB / thumbMB).toFixed(0)} lan)`);
  console.log(`  Da ghi ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
