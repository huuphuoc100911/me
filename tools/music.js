#!/usr/bin/env node
/**
 * Cap nhat danh sach nhac nen theo dung cac file nhac dang co trong thu muc:
 *   music/love -> SONGS trong js/love-music.js (love.html + 4 trang qua)
 *   music/soc  -> MUSIC_LIST trong soc.html
 * Trang tinh (Vercel) khong tu doc duoc thu muc, nen them / xoa bai thi chay:
 *
 *   npm run music
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
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
