#!/usr/bin/env node
/**
 * Quan ly thu gui tuong lai.
 *
 *   npm run letter -- them --ngay 2026-10-18 --tieude "Gửi em" --file thu.txt
 *   npm run letter -- them --ngay 2026-10-18 --tieude "Gửi em" --chu "Nội dung..."
 *   npm run letter -- xem              # liet ke tat ca
 *   npm run letter -- doc <id>         # giai ma de tu kiem tra lai
 *   npm run letter -- xoa <id>
 */
const fs = require('fs');
const path = require('path');
const Letters = require('../js/letters.js');

const FILE = path.join(__dirname, '..', 'data', 'letters.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function save(list) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2) + '\n');
}

/** --ngay 2026-10-18 --tieude "..." -> { ngay: '...', tieude: '...' } */
function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return o;
}

const [, , cmd, ...rest] = process.argv;
const list = load();

if (cmd === 'them') {
  const a = parseArgs(rest);
  const ngay = a.ngay;
  const tieude = a.tieude;
  const chu = a.file ? fs.readFileSync(a.file, 'utf8').trim() : a.chu;

  if (!ngay || !/^\d{4}-\d{2}-\d{2}$/.test(ngay)) {
    console.error('Thieu --ngay (dang YYYY-MM-DD), vi du --ngay 2026-10-18'); process.exit(1);
  }
  if (!tieude) { console.error('Thieu --tieude'); process.exit(1); }
  if (!chu || chu === true) { console.error('Thieu noi dung: dung --chu "..." hoac --file duong/dan.txt'); process.exit(1); }

  const id = 'thu-' + Date.now().toString(36);
  list.push({ id, icon: a.icon || '💌', title: tieude, openAt: ngay, body: Letters.encode(chu, ngay) });
  list.sort((x, y) => x.openAt.localeCompare(y.openAt));
  save(list);

  const con = Letters.daysLeft(ngay);
  console.log(`✓ Da luu thu "${tieude}"`);
  console.log(`  Mo vao ${ngay}${con ? ` — con ${con} ngay` : ' — mo duoc ngay hom nay'}`);
  console.log(`  Noi dung da ma hoa, khong doc duoc trong ${path.relative(process.cwd(), FILE)}`);
  console.log(`\n  Dung day len: git add data/letters.json && git commit -m "them thu" && git push`);

} else if (cmd === 'xem' || !cmd) {
  if (!list.length) { console.log('Chua co thu nao. Them bang: npm run letter -- them --ngay ... --tieude ... --chu "..."'); process.exit(0); }
  console.log(`  ${list.length} la thu:\n`);
  list.forEach((l) => {
    const con = Letters.daysLeft(l.openAt);
    const trangThai = Letters.isOpen(l.openAt) ? 'DA MO' : `con ${con} ngay`;
    console.log(`  ${l.icon}  ${l.title}`);
    console.log(`     ${l.id} · mo ${l.openAt} · ${trangThai} · ${l.body.length} ky tu ma hoa\n`);
  });

} else if (cmd === 'doc') {
  const l = list.find((x) => x.id === rest[0]);
  if (!l) { console.error('Khong tim thay thu co id do. Chay `npm run letter -- xem` de liet ke.'); process.exit(1); }
  console.log(`  ${l.icon} ${l.title} (mo ${l.openAt})\n`);
  console.log(Letters.decode(l.body, l.openAt));

} else if (cmd === 'xoa') {
  const i = list.findIndex((x) => x.id === rest[0]);
  if (i < 0) { console.error('Khong tim thay thu co id do.'); process.exit(1); }
  const [bo] = list.splice(i, 1);
  save(list);
  console.log(`✓ Da xoa "${bo.title}"`);

} else {
  console.log(`Cach dung:
  npm run letter -- them --ngay 2026-10-18 --tieude "Gửi em" --chu "Nội dung..."
  npm run letter -- them --ngay 2026-10-18 --tieude "Gửi em" --file thu.txt --icon 🌹
  npm run letter -- xem
  npm run letter -- doc <id>
  npm run letter -- xoa <id>`);
}
