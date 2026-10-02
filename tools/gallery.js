#!/usr/bin/env node
/**
 * Quet thu muc anh/video -> tao ban thu nho + ghi danh sach ra images.json
 *
 *   node tools/gallery.js          # chi xu ly file moi
 *   node tools/gallery.js --force  # lam lai tat ca
 *
 * Trang web doc images.json nen chi can tha file vao thu muc roi chay lenh nay,
 * khong phai sua code nua.
 *
 * Dat ten file theo ngay thi anh tu gan vao dung moc tren cac trang (xem dateFromName).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const Milestones = require('../js/milestones.js');
const Lunar = require('../js/lunar.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'images', 'love');
const THUMBS = path.join(DIR, 'thumbs');
const MD = path.join(DIR, 'md');
const MANIFEST = path.join(DIR, 'images.json');

const THUMB_WIDTH = 700;     // du net cho luoi 3 cot tren man hinh retina
const THUMB_QUALITY = 72;
// Ban vua de xem toan man hinh tren dien thoai: anh goc 1-2 MB tai lau, ban nay
// ~150-300 KB ma van net. Anh goc da nho san thi khong can.
const MD_EDGE = 1600;
const MD_QUALITY = 80;
const MD_MIN_BYTES = 350 * 1024;
const FORCE = process.argv.includes('--force');

const isVideo = (f) => /\.(mp4|webm|mov)$/i.test(f);
const isImage = (f) => /\.(jpe?g|png|webp|gif)$/i.test(f);

/** 'YYYY-MM-DD' neu ngay co that (31-02 hay 13-13 thi bo qua) */
function ymd(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? Milestones.dayKey(dt) : null;
}

/**
 * Ngay cua anh doc tu ten file — cac trang lay ngay nay de gan anh vao dung moc:
 *   03-08-25.jpg, 06-09-2026.jpg, 2026-09-06.jpg   -> dung ngay do
 *   100 day.jpg, 200.jpg, 300day.mp4, 400-ngay.jpg -> moc 100, 200, 300, 400 ngay
 *   tet-am-lich-2026.mp4, tet-2027.jpg             -> mung 1 Tet nam do
 * Them chu phia sau van nhan (03-08-25 (2).jpg, 06-09-26-hien-mau.jpg) de mot
 * ngay co nhieu tam. Ten khac (hello.jpg, love-1.jpg...) thi khong co ngay.
 */
function dateFromName(file) {
  const base = file.replace(/\.[^.]+$/, '').toLowerCase();
  let m;
  if ((m = base.match(/^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/))) return ymd(+m[1], +m[2], +m[3]);
  if ((m = base.match(/^(\d{1,2})[-_.](\d{1,2})[-_.](\d{4}|\d{2})(?!\d)/))) {
    return ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  }
  if ((m = base.match(/^(\d{3,5})(?:[\s_-]*(?:days?|ngay|ngày))?(?:[\s_(-].*)?$/)) && +m[1] % 100 === 0) {
    const s = new Date(Milestones.START);
    return Milestones.dayKey(new Date(s.getFullYear(), s.getMonth(), s.getDate() + +m[1]));
  }
  if ((m = base.match(/^t[eế]t\D*?(\d{4})(?!\d)/))) {
    const [d, mo, y] = Lunar.toSolar(1, 1, +m[1]);
    return ymd(y, mo, d);
  }
  return null;
}

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
  const entry = { f: file, t: 'img', w: meta.width, h: meta.height, thumb: path.basename(thumb) };

  const md = path.join(MD, path.basename(thumb));
  if (fs.statSync(src).size > MD_MIN_BYTES || Math.max(meta.width, meta.height) > MD_EDGE) {
    if (FORCE || !fs.existsSync(md)) {
      await sharp(src).rotate().resize({ width: MD_EDGE, height: MD_EDGE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: MD_QUALITY }).toFile(md);
    }
    entry.md = path.basename(md);
  }
  return entry;
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
  fs.mkdirSync(MD, { recursive: true });
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) console.warn('! Khong tim thay ffmpeg — video se khong co anh dai dien');

  const files = fs.readdirSync(DIR).filter((f) => isImage(f) || isVideo(f)).sort();
  const entries = [];
  let made = 0;

  for (const file of files) {
    const before = fs.readdirSync(THUMBS).length;
    const entry = isVideo(file) ? await videoEntry(file, ffmpeg) : await imageEntry(file, ffmpeg);
    if (fs.readdirSync(THUMBS).length > before) made++;
    const d = dateFromName(file);
    if (d) entry.d = d;
    entries.push(entry);
    process.stdout.write(`\r  ${entries.length}/${files.length} ${file.slice(0, 44).padEnd(46)}`);
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(entries, null, 0));

  // Doi ten / xoa file goc thi ban thu nho cu thanh rac — don luon
  const keep = new Set(entries.map((e) => e.thumb).filter(Boolean));
  const stale = fs.readdirSync(THUMBS).filter((f) => f.endsWith('.webp') && !keep.has(f));
  stale.forEach((f) => fs.rmSync(path.join(THUMBS, f)));
  const keepMd = new Set(entries.map((e) => e.md).filter(Boolean));
  fs.readdirSync(MD).filter((f) => f.endsWith('.webp') && !keepMd.has(f)).forEach((f) => fs.rmSync(path.join(MD, f)));

  const sizeOf = (d, list) => list.reduce((s, f) => s + fs.statSync(path.join(d, f)).size, 0);
  const origMB = sizeOf(DIR, files) / 1048576;
  const thumbMB = sizeOf(THUMBS, fs.readdirSync(THUMBS)) / 1048576;
  const imgs = entries.filter((e) => e.t === 'img').length;

  console.log(`\n\n  ${entries.length} muc (${imgs} anh, ${entries.length - imgs} video) — tao moi ${made} ban thu nho`);
  console.log(`  Goc ${origMB.toFixed(0)} MB  ->  luoi hien thi ${thumbMB.toFixed(1)} MB  (nhe hon ${(origMB / thumbMB).toFixed(0)} lan)`);
  const mdList = entries.filter((e) => e.md);
  if (mdList.length) {
    const before = sizeOf(DIR, mdList.map((e) => e.f)) / 1048576;
    const after = sizeOf(MD, mdList.map((e) => e.md)) / 1048576;
    console.log(`  Ban xem toan man hinh: ${mdList.length} anh ${before.toFixed(1)} MB -> ${after.toFixed(1)} MB`);
  }
  if (stale.length) console.log(`  Xoa ${stale.length} ban thu nho khong con file goc`);
  const dated = entries.filter((e) => e.d);
  if (dated.length) console.log(`  Co ngay: ${dated.map((e) => `${e.f} -> ${e.d}`).join(', ')}`);
  console.log(`  Da ghi ${path.relative(ROOT, MANIFEST)}`);
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
