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
const { execFileSync, spawnSync } = require('child_process');
const sharp = require('sharp');
const Milestones = require('../js/milestones.js');
const Lunar = require('../js/lunar.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'images', 'love');
const THUMBS = path.join(DIR, 'thumbs');
const MD = path.join(DIR, 'md');
const NHO = path.join(DIR, 'nho');      // ban nho 240px cho cac o be (xem makeNho)
const MANIFEST = path.join(DIR, 'images.json');

const THUMB_WIDTH = 560;     // luoi 2-3 cot tren dien thoai (o ~180px CSS x DPR 3); 700/q72 truoc day nang gan gap doi
const THUMB_QUALITY = 65;    // Doi 2 so nay thi xoa images/love/thumbs/*.webp roi chay lai, va doi CACHE trong sw-love.js
// Ban vua de xem toan man hinh tren dien thoai: anh goc 1-2 MB tai lau, ban nay
// ~150-300 KB ma van net. Anh goc da nho san thi khong can.
const MD_EDGE = 1600;
const MD_QUALITY = 80;
const MD_MIN_BYTES = 350 * 1024;
const NHO_WIDTH = 240;
const NHO_QUALITY = 70;
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
 *   24-08-25.jpg, 06-09-2026.jpg, 2026-09-06.jpg   -> dung ngay do
 *   100 day.jpg, 200.jpg, 300day.mp4, 400-ngay.jpg -> moc 100, 200, 300, 400 ngay
 *   tet-am-lich-2026.mp4, tet-2027.jpg             -> mung 1 Tet nam do
 * Them chu phia sau van nhan (24-08-25 (2).jpg, 06-09-26-hien-mau.jpg) de mot
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
  // ngay day du nam giua ten: hienmau06-09-2026.jpg, photobook-07-12-25.jpg
  if ((m = base.match(/(?:^|\D)(\d{1,2})[-_.](\d{1,2})[-_.](20\d{2}|\d{2})(?!\d)/))) {
    const d = ymd(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    if (d) return d;
  }
  return eventFromName(file);
}

/** Ten khong dau, viet lien: "Pháo hoa giao thừa.mp4" -> "phaohoagiaothua" */
function compactName(file) {
  return file.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Nam ghi trong ten (2025, 2026...) neu co */
const yearIn = (s) => { const m = s.match(/20[2-3]\d/); return m ? +m[0] : null; };

/**
 * Ten ke dip (khong can ngay so) -> dung ngay cua dip do. Khong ghi nam thi lay
 * lan dau tien tu ngay yeu nhau:
 *   sinhnhatanh, quasinhnhatanh2.jpg  -> 09/10/2026      sinhnhatem -> 23/10/2025
 *   giangsinh / noel -> 25/12   nammoi -> 01/01   valentine -> 14/02
 *   giaothua, phaohoatet -> mung 1 Tet               ngayyeunhau -> 18/10/2025
 *   hienmaulandau / hienmaulan2 / hienmau2026 -> dung lan di hien mau do
 *   emhienmau3.jpg (khong ghi nam)             -> lan di hien mau gan nhat
 *   le2:9 (Finder doi dau / thanh :), ngay7thang12 -> ngay do
 */
function eventFromName(file) {
  const c = compactName(file);
  const y = yearIn(c);
  const START = new Date(Milestones.START);
  // ngay thang/nam dau tien >= ngay yeu nhau (hoac dung nam ghi trong ten)
  const solar = (mo, d) => {
    if (y) return ymd(y, mo, d);
    const first = new Date(START.getFullYear(), mo - 1, d);
    return Milestones.dayKey(first < START ? new Date(START.getFullYear() + 1, mo - 1, d) : first);
  };
  // "lễ 2/9" (Finder luu dau / thanh :), "ngay 7 thang 12" -> dung ngay do
  const plain = file.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let m = plain.match(/(?:le|ngay)[\s_-]*(\d{1,2})[\s_-]*(?:[:/.-]|thang)[\s_-]*(\d{1,2})(?!\d)/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return solar(+m[2], +m[1]);
  if (/sinhnhatanh|snanh/.test(c)) return solar(10, 9);
  if (/sinhnhatem|snem/.test(c)) return solar(10, 23);
  if (/giangsinh|noel|christmas|xmas/.test(c)) return solar(12, 25);
  if (/val[a-z]{0,3}ntin/.test(c)) return solar(2, 14);   // ca "valientine" go nham
  if (/giaothua|tet/.test(c)) {
    let ly = y || START.getFullYear();
    let [d, mo, sy] = Lunar.toSolar(1, 1, ly);
    if (!y && new Date(sy, mo - 1, d) < START) [d, mo, sy] = Lunar.toSolar(1, 1, ly + 1);
    return ymd(sy, mo, d);
  }
  if (/nammoi|newyear/.test(c)) return solar(1, 1);
  if (/(ngaydau|ngay)yeunhau/.test(c)) return Milestones.dayKey(START);
  if (/hienmau/.test(c)) {
    const all = Milestones.build().filter((m) => m.tag === 'hien-mau');
    // khong ghi nam / lan -> lan di hien mau gan nhat (anh moi chup thuong la lan vua roi)
    const past = all.filter((m) => m.ts <= Date.now());
    const pick = /landau|lan1(?!\d)|lanmot/.test(c) ? all[0]
      : /lan2(?!\d)|lanhai/.test(c) ? all[1]
      : y ? all.find((m) => m.key.startsWith(String(y))) : past[past.length - 1];
    return pick ? pick.key : null;
  }
  return null;
}

/**
 * Chi biet thang (khong ro ngay) -> { s: '2026-04', sl: 'Tháng 4 · 2026' }.
 * Trang Rap phim dung de xep phim cho dung thu tu; cac trang khac van coi la
 * anh chua co ngay.
 *   xemphimthang4-2026, emdethuongthang42026, chupphotobook1220252 -> thang 4, 4, 12
 *   cuoinam2025 / daunam2026 / giuanam2026                         -> thang 12, 1, 6
 *   thang11 (khong ghi nam) -> lan dau tien tu ngay yeu nhau (11/2025)
 */
function monthFromName(file) {
  const c = compactName(file);
  let m, y, mo, label;
  if ((m = c.match(/(cuoi|dau|giua)nam(20[2-3]\d)/))) {
    y = +m[2];
    mo = { cuoi: 12, dau: 1, giua: 6 }[m[1]];
    label = `${{ cuoi: 'Cuối', dau: 'Đầu', giua: 'Giữa' }[m[1]]} năm ${y}`;
  } else if ((m = c.match(/mua(xuan|he|thu|dong)(20[2-3]\d)/))) {
    y = +m[2];
    mo = { xuan: 3, he: 6, thu: 9, dong: 12 }[m[1]];
    label = `Mùa ${{ xuan: 'xuân', he: 'hè', thu: 'thu', dong: 'đông' }[m[1]]} ${y}`;
  } else if ((m = c.match(/(?:^|[^0-9])(?:thang)?(1[0-2]|0?[1-9])(20[2-3]\d)/))) {
    mo = +m[1]; y = +m[2];
  } else if ((m = c.match(/thang(1[0-2]|0?[1-9])(?![0-9])/))) {
    const START = new Date(Milestones.START);
    mo = +m[1];
    y = START.getFullYear() + (mo - 1 < START.getMonth() ? 1 : 0);
  } else return null;
  return { s: `${y}-${String(mo).padStart(2, '0')}`, sl: label || `Tháng ${mo} · ${y}` };
}

/** ffmpeg he thong, khong co thi muon binary cua yt-playlist-mp3 (Mac: darwin_arm64, Linux: linux) */
function findFfmpeg() {
  try {
    return execFileSync('which', ['ffmpeg'], { encoding: 'utf8' }).trim();
  } catch {
    const bin = path.join(ROOT, 'yt-playlist-mp3/.venv/lib/python3.12/site-packages/static_ffmpeg/bin');
    const dirs = [`${process.platform}_${process.arch}`, process.platform];
    return dirs.map((d) => path.join(bin, d, 'ffmpeg')).find((f) => fs.existsSync(f)) || null;
  }
}

/**
 * Ban nho 240px, cung ten voi thumb, nam trong nho/: cho o ghep trai tim (~40px), dai anh chay
 * (84-150px), anh canh moc va trong lich (48-64px). ~8 KB thay vi ~44 KB, va dien thoai khong
 * phai giai ma 56 anh 700px cung luc (ton ~190 MB bo nho anh -> nong may).
 */
async function makeNho(src, name) {
  fs.mkdirSync(NHO, { recursive: true });
  const out = path.join(NHO, name);
  if (!FORCE && fs.existsSync(out)) return;
  await sharp(src).rotate().resize({ width: NHO_WIDTH, withoutEnlargement: true })
    .webp({ quality: NHO_QUALITY }).toFile(out);
}

async function imageEntry(file, ffmpeg) {
  const src = path.join(DIR, file);
  const thumb = path.join(THUMBS, file.replace(/\.[^.]+$/, '') + '.webp');
  const meta = await sharp(src).metadata();
  if (FORCE || !fs.existsSync(thumb)) {
    await sharp(src).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY }).toFile(thumb);
  }
  await makeNho(src, path.basename(thumb));
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
    await makeNho(thumb, path.basename(thumb));     // video: lay tu anh dai dien
  }
  const entry = { f: file, t: 'vid', w, h, thumb: fs.existsSync(thumb) ? path.basename(thumb) : null };
  if (entry.thumb) entry.fp = await fingerprint(thumb);
  if (ffmpeg) Object.assign(entry, soundInfo(ffmpeg, src));
  return entry;
}

/**
 * Do dai (giay) + co tieng hay khong: { dur: 26.3, a: 1 }. Trang Rap phim chieu
 * het video co tieng (mo tieng, tat nhac nen); video cam thi cat mot doan ngan.
 * Co track am thanh nhung im lang (to nhat < -45 dB) van tinh la video cam.
 */
function soundInfo(ffmpeg, src) {
  // ffmpeg in thong tin ra stderr
  const log = spawnSync(ffmpeg, ['-hide_banner', '-nostats', '-i', src, '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr || '';
  const out = {};
  const d = log.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (d) out.dur = Math.round((+d[1] * 3600 + +d[2] * 60 + +d[3]) * 10) / 10;
  const max = log.match(/max_volume: (-?[\d.]+) dB/);
  if (/Stream #.*Audio:/.test(log) && max && +max[1] > -45) out.a = 1;
  return out;
}

/**
 * "Dau van tay" 64 bit cua anh dai dien (dHash): cung mot clip luu 2 lan (ten khac,
 * nen lai khac) van ra gan nhu y het -> trang Rap phim chi chieu 1 lan.
 */
async function fingerprint(file) {
  const px = await sharp(file).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) byte = (byte << 1) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
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
    else Object.assign(entry, monthFromName(file));
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
  const monthly = entries.filter((e) => e.s);
  if (monthly.length) console.log(`  Biet thang: ${monthly.map((e) => `${e.f} -> ${e.sl}`).join(', ')}`);
  const none = entries.filter((e) => !e.d && !e.s);
  if (none.length) console.log(`  Chua co ngay (${none.length}): ${none.map((e) => e.f).join(', ')}`);
  console.log(`  Da ghi ${path.relative(ROOT, MANIFEST)}`);
}

if (require.main === module) main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
module.exports = { dateFromName, monthFromName };
