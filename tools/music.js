#!/usr/bin/env node
/**
 * Cap nhat danh sach nhac nen theo dung cac file nhac dang co trong thu muc:
 *   music/love -> SONGS trong js/love-music.js (love.html + cac trang qua)
 *   music/soc  -> MUSIC_LIST trong soc.html
 * Trang tinh (Vercel) khong tu doc duoc thu muc, nen them / xoa bai thi chay:
 *
 *   npm run music
 *
 * Voi music/love, truoc khi cap nhat danh sach, moi file nhac (mp3 / m4a / aac / wav / flac / ogg) duoc:
 *   - doi ten thanh chu thuong khong dau noi bang '-' ("Chuyện Đôi Ta - Da LAB.m4a" -> chuyen-doi-ta-da-lab.mp3)
 *     de trang qua tim duoc bai rieng theo PAGE_SONG trong js/love-music.js;
 *   - chuyen sang mp3 128 kbps (bo anh bia) neu khong phai mp3 hoac nang hon 160 kbps — 3-4 MB/bai cho 4G.
 *     File goc cat vao music/_goc/ (khong dua len web, co trong .gitignore).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const LOVE = path.join(ROOT, 'music/love'), KEEP = path.join(ROOT, 'music/_goc');

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bai-hat';

/** Doi ten + chuyen mp3 128 kbps cac file trong music/love */
function prepareLove() {
  const files = fs.readdirSync(LOVE).filter((x) => /\.(mp3|m4a|aac|wav|flac|ogg)$/i.test(x));
  let ffmpeg = null;
  const ff = () => { if (!ffmpeg) { ffmpeg = require('./hoat-hinh.js').findFfmpeg(); if (!ffmpeg) throw new Error('khong tim thay ffmpeg'); } return ffmpeg; };
  const kbps = (file) => { const r = spawnSync(ff(), ['-hide_banner', '-i', file], { encoding: 'utf8' }); const m = /bitrate: (\d+) kb\/s/.exec(r.stderr || ''); return m ? +m[1] : 0; };
  for (const x of files) {
    const src = path.join(LOVE, x), ext = path.extname(x).toLowerCase();
    const name = slug(path.basename(x, path.extname(x))) + '.mp3', dst = path.join(LOVE, name);
    const convert = ext !== '.mp3' || kbps(src) > 160;
    if (!convert) {
      if (x === name) continue;
      if (fs.existsSync(dst)) { console.log(`  ! bo qua ${x}: da co ${name}`); continue; }
      fs.renameSync(src, dst); console.log(`  doi ten: ${x} -> ${name}`); continue;
    }
    if (x !== name && fs.existsSync(dst)) { console.log(`  ! bo qua ${x}: da co ${name}`); continue; }
    const tmp = dst + '.tmp.mp3';
    execFileSync(ff(), ['-y', '-loglevel', 'error', '-i', src, '-vn', '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '128k', tmp]);
    fs.mkdirSync(KEEP, { recursive: true });
    fs.renameSync(src, path.join(KEEP, x));
    fs.renameSync(tmp, dst);
    console.log(`  chuyen mp3 128 kbps: ${x} -> ${name} (${(fs.statSync(dst).size / 1048576).toFixed(1)} MB, file goc o music/_goc)`);
  }
}
prepareLove();
const TARGETS = [
  { dir: 'music/love', file: 'js/love-music.js', re: /const SONGS = \[[\s\S]*?\];/, name: 'SONGS', indent: '    ', close: '  ' },
  { dir: 'music/soc', file: 'soc.html', re: /const MUSIC_LIST = \[[\s\S]*?\];/, name: 'MUSIC_LIST', indent: '  ', close: '' },
];

const quote = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

for (const t of TARGETS) {
  const songs = fs.readdirSync(path.join(ROOT, t.dir)).filter((f) => /\.(mp3|m4a|aac|ogg)$/i.test(f)).sort();
  if (!songs.length) { console.log(`  ${t.dir}: chua co bai nao — bo qua`); continue; }
  const file = path.join(ROOT, t.file);
  const src = fs.readFileSync(file, 'utf8');
  if (!t.re.test(src)) { console.error(`  Khong thay ${t.name} trong ${t.file}`); process.exitCode = 1; continue; }
  const list = songs.map((f) => `${t.indent}'${t.dir}/${quote(f)}',`).join('\n');
  const out = src.replace(t.re, `const ${t.name} = [\n${list}\n${t.close}];`);
  if (out === src) console.log(`  ${t.file}: da khop ${t.dir} (${songs.length} bai)`);
  else { fs.writeFileSync(file, out); console.log(`  ${t.file}: da cap nhat theo ${t.dir} (${songs.length} bai)`); }
  songs.forEach((f) => console.log(`     - ${f}`));
}

// Trang nao da co bai rieng
delete require.cache[require.resolve('../js/love-music.js')];
const LM = require('../js/love-music.js');
console.log('  Bai rieng tung trang (PAGE_SONG trong js/love-music.js):');
for (const [page, key] of Object.entries(LM.PAGE_SONG)) {
  const song = LM.pageSong(page);
  console.log(`     ${page.padEnd(22)} ${song ? song.replace('music/love/', '') : '(chua co file chua "' + key + '" -> phat ngau nhien)'}`);
}
console.log('     love.html              ngau nhien ca danh sach');
