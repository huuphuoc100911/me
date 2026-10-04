#!/usr/bin/env node
/**
 * Cap nhat danh sach nhac nen (SONGS trong js/love-music.js) theo dung cac file
 * nhac dang co trong music/love. Trang tinh (Vercel) khong tu doc duoc thu muc,
 * nen them / xoa bai thi chay:
 *
 *   npm run music
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'music', 'love');
const FILE = path.join(ROOT, 'js', 'love-music.js');

const songs = fs.readdirSync(DIR).filter((f) => /\.(mp3|m4a|aac|ogg)$/i.test(f)).sort();
if (!songs.length) { console.error('music/love chua co bai nao'); process.exit(1); }

const src = fs.readFileSync(FILE, 'utf8');
const list = songs.map((f) => `    'music/love/${f.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`).join('\n');
const out = src.replace(/const SONGS = \[[\s\S]*?\];/, `const SONGS = [\n${list}\n  ];`);
if (out === src) {
  console.log(`  Danh sach da khop thu muc (${songs.length} bai)`);
} else {
  fs.writeFileSync(FILE, out);
  console.log(`  Da cap nhat js/love-music.js: ${songs.length} bai`);
}
songs.forEach((f) => console.log(`   - ${f}`));
