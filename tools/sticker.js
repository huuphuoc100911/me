#!/usr/bin/env node
/**
 * Bo sticker chibi hai dua (anh + em trong phim hoat hinh) — 512x512 PNG nen trong suot
 *
 *   npm run sticker     # -> sticker/*.png (gui Messenger / Zalo dang anh, hoac lam bo sticker Telegram)
 *                       #    sticker/nho/*.webp (anh nho cho trang qua-nho.html), sticker.json, .zip
 *
 * Nhan vat ve bang chinh js/chibi.js cua phim. Moi sticker: ham draw(g, K) dat nhan vat +
 * do vat vao nhom g; K = bo do nghe (makeChar, heart, put, ...). Ham chay trong Chrome nen
 * chi dung K, khong dung bien cua file nay. Chu (text) sua thoai mai roi chay lai lenh.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { openChrome } = require('./chrome.js');

// ★ Danh sach sticker — sua chu (text) / mau chu (color) thoai mai
const STICKERS = [
  { id: 'yeu-em', text: 'Yêu em nhiều', color: '#e8456b', draw(g, K) {
    const a = K.makeChar('anh'); g.append(a.g);
    const A = { x: 256, y: 420, s: 1.3, armL: -40, armR: -40, eyes: 'happy', mouth: 'open', blush: 0.9 };
    a.set(A);
    const [lx, ly] = a.hand(A, 'L'), [rx, ry] = a.hand(A, 'R');
    K.put(g, K.heart('#ff3d68', 2.9), (lx + rx) / 2, (ly + ry) / 2 + 22);
    K.put(g, K.heart('#ff8fab', 1.4), 104, 160, -16);
    K.put(g, K.heart('#ff8fab', 1), 410, 118, 14);
    K.put(g, K.star('#ffd23f', 14), 400, 200);
  } },
  { id: 'thuong-anh', text: 'Thương anh nhất', color: '#e8456b', draw(g, K) {
    const e = K.makeChar('em'); g.append(e.g);
    e.set({ x: 256, y: 420, s: 1.3, armL: 135, armR: 135, eyes: 'happy', mouth: 'open', blush: 1 });
    K.put(g, K.heart('#ff3d68', 1.6), 90, 120, -18);
    K.put(g, K.heart('#ff8fab', 1.2), 420, 96, 16);
    K.put(g, K.heart('#ff6b8a', 0.9), 446, 200, 10);
    K.put(g, K.star('#ffd23f', 12), 70, 230);
  } },
  { id: 'om', text: 'Ôm cái nào', color: '#e8456b', draw(g, K) {
    const a = K.makeChar('anh'), e = K.makeChar('em'); g.append(a.g, e.g);
    a.set({ x: 214, y: 420, s: 1.15, tilt: 12, eyes: 'happy', mouth: 'open', blush: 0.9 });
    e.set({ x: 296, y: 420, s: 1.15, tilt: -12, armL: -78, eyes: 'happy', blush: 1 });
    K.put(g, K.heart('#ff3d68', 1.5), 256, 96);
    K.put(g, K.heart('#ff8fab', 1), 196, 70, -14);
    K.put(g, K.heart('#ff8fab', 0.9), 318, 64, 14);
  } },
  { id: 'nam-tay', text: 'Đi chơi hông?', color: '#3d8fd6', draw(g, K) {
    const a = K.makeChar('anh'), e = K.makeChar('em'); g.append(a.g, e.g);
    a.set({ x: 199, y: 420, s: 1.15, armR: -38, armL: 14, legL: 14, legR: -10, mouth: 'open' });
    e.set({ x: 313, y: 420, s: 1.15, armL: -38, armR: 14, legL: 10, legR: -14, mouth: 'open', blush: 0.8 });
    K.put(g, K.heart('#ff3d68', 1.3), 256, 112);
    K.put(g, K.star('#ffd23f', 12), 92, 130);
    K.put(g, K.star('#ffd23f', 9), 428, 160);
  } },
  { id: 'doi', text: 'Dỗi rồi nha!', color: '#d63a4f', draw(g, K) {
    const e = K.makeChar('em'); g.append(e.g);
    e.set({ x: 256, y: 420, s: 1.3, armL: -66, armR: -66, tilt: 12, lids: 'angry', mouth: 'pout', blush: 1 });
    K.put(g, K.anger('#ff3d4f'), 360, 104, 0, 1.5);
  } },
  { id: 'xin-loi', text: 'Anh xin lỗi mà', color: '#3d8fd6', draw(g, K) {
    const a = K.makeChar('anh'); g.append(a.g);
    const A = { x: 256, y: 420, s: 1.3, nod: 8, tilt: -6, armL: -42, armR: -42, lids: 'sad', mouth: 'frown', blush: 0.8 };
    a.set(A);
    const [lx, ly] = a.hand(A, 'L'), [rx, ry] = a.hand(A, 'R');
    K.put(g, K.rose(), (lx + rx) / 2, (ly + ry) / 2, -8, 1.3);
    K.put(g, K.drop('#8fd3ff', 1.5), 360, 128, 20);
  } },
  { id: 'ngu-ngon', text: 'Ngủ ngon nha', color: '#5a6fd6', draw(g, K) {
    const a = K.makeChar('anh'), e = K.makeChar('em'); g.append(a.g, e.g);
    a.set({ x: 212, y: 450, s: 1.2, tilt: 16, eyes: 'closed', blush: 0.6 });
    e.set({ x: 300, y: 450, s: 1.2, tilt: -16, eyes: 'closed', blush: 0.7 });
    K.put(g, K.blanket(), 256, 300);
    K.put(g, K.moon('#ffd95a'), 96, 100, -10, 1.2);
    K.put(g, K.txt('Z', 44, '#7f95e6'), 392, 120, 12);
    K.put(g, K.txt('z', 34, '#7f95e6'), 428, 84, 12);
    K.put(g, K.txt('z', 26, '#7f95e6'), 452, 56, 12);
  } },
  { id: 'day-chua', text: 'Dậy chưa nè?', color: '#f08a24', draw(g, K) {
    K.put(g, K.sun('#ffd23f'), 112, 118, 0, 1.1);
    const e = K.makeChar('em'); g.append(e.g);
    e.set({ x: 276, y: 420, s: 1.3, armR: 120, armL: 8, eyes: 'happy', mouth: 'open', blush: 0.8 });
  } },
  { id: 'nho', text: 'Nhớ anh quá', color: '#e8456b', draw(g, K) {
    const e = K.makeChar('em'); g.append(e.g);
    const E = { x: 236, y: 420, s: 1.3, armL: -52, armR: -52, lids: 'sad', mouth: 'frown', blush: 0.9 };
    e.set(E);
    const [lx, ly] = e.hand(E, 'L'), [rx, ry] = e.hand(E, 'R');
    K.put(g, K.heart('#ffb3c6', 3.1), (lx + rx) / 2, (ly + ry) / 2 + 30);
    K.put(g, K.drop('#8fd3ff', 0.9), 196, 214);
    K.put(g, K.think(), 410, 110);
  } },
  { id: 'tra-sua', text: 'Trà sữa hông?', color: '#b0703c', draw(g, K) {
    const e = K.makeChar('em'); g.append(e.g);
    const E = { x: 226, y: 420, s: 1.3, armR: -24, armL: 10, eyes: 'heart', mouth: 'open', blush: 0.9 };
    e.set(E);
    const [hx, hy] = e.hand(E, 'R');
    K.put(g, K.boba(), hx + 30, hy + 2, 6, 1.25);
    K.put(g, K.star('#ffd23f', 12), 424, 110);
    K.put(g, K.star('#ffd23f', 8), 90, 140);
  } },
  { id: 'hu-hu', text: 'Hu hu…', color: '#3d8fd6', draw(g, K) {
    const e = K.makeChar('em'); g.append(e.g);
    e.set({ x: 256, y: 420, s: 1.3, armL: 18, armR: 18, eyes: 'squeeze', mouth: 'wail', tears: 1, blush: 0.9 });
    K.put(g, K.drop('#8fd3ff', 1.1), 132, 200, -60);
    K.put(g, K.drop('#8fd3ff', 0.8), 108, 248, -70);
    K.put(g, K.drop('#8fd3ff', 1.1), 380, 200, 60);
    K.put(g, K.drop('#8fd3ff', 0.8), 404, 248, 70);
  } },
  { id: 'thom', text: 'Thơm cái nè', color: '#e8456b', draw(g, K) {
    const a = K.makeChar('anh'), e = K.makeChar('em'); g.append(a.g, e.g);
    a.set({ x: 206, y: 420, s: 1.15, tilt: -6, mouth: 'o', blush: 1 });
    e.set({ x: 300, y: 420, s: 1.15, tilt: -20, armL: -70, eyes: 'closed', mouth: 'kissL', blush: 0.9 });
    K.put(g, K.heart('#ff3d68', 1.2), 170, 112, -16);
    K.put(g, K.heart('#ff8fab', 0.9), 128, 160, -24);
    K.put(g, K.heart('#ff6b8a', 0.8), 214, 74, 10);
  } },
  { id: 'oke', text: 'Oke luôn!', color: '#2f9e5a', draw(g, K) {
    const a = K.makeChar('anh'); g.append(a.g);
    a.set({ x: 240, y: 420, s: 1.3, armR: 122, armL: 12, eyes: 'happy', mouth: 'grin', blush: 0.8 });
    K.put(g, K.check(), 404, 112, 0, 1.1);
    K.put(g, K.star('#ffd23f', 13), 96, 150);
    K.put(g, K.star('#ffd23f', 9), 120, 96);
  } },
  { id: 'toi-lien', text: 'Anh tới liền!', color: '#f08a24', draw(g, K) {
    K.put(g, K.speed(), 92, 250);
    const a = K.makeChar('anh'); g.append(a.g);
    a.set({ x: 272, y: 414, s: 1.3, legL: 38, legR: -34, armL: -50, armR: -44, tilt: 8, bob: -6, mouth: 'open', blush: 0.7 });
    K.put(g, K.drop('#8fd3ff', 1.2), 176, 110, -30);
  } },
  { id: 'hien-mau', text: 'Hiến máu hông?', color: '#d63a4f', draw(g, K) {
    const a = K.makeChar('anh', { outfit: 'blood' }), e = K.makeChar('em', { outfit: 'blood' }); g.append(a.g, e.g);
    a.set({ x: 182, y: 420, s: 1.12, armR: 140, eyes: 'happy', mouth: 'open' });
    e.set({ x: 330, y: 420, s: 1.12, armL: 140, eyes: 'happy', mouth: 'open', blush: 0.8 });
    K.put(g, K.blood(), 256, 128, 0, 1.1);
  } },
  { id: 'mot-nam', text: '1 năm rồi nè!', color: '#e8456b', draw(g, K) {
    const a = K.makeChar('anh', { outfit: 'couple', hat: 'party' }), e = K.makeChar('em', { outfit: 'couple', hat: 'party' }); g.append(a.g, e.g);
    a.set({ x: 160, y: 420, s: 1.08, armR: -30, eyes: 'happy', mouth: 'open' });
    e.set({ x: 352, y: 420, s: 1.08, armL: -30, eyes: 'happy', mouth: 'open', blush: 0.8 });
    K.put(g, K.cake(), 256, 426, 0, 1.3);
    K.put(g, K.star('#ffd23f', 12), 256, 96);
    K.put(g, K.heart('#ff6b8a', 1), 210, 140, -12);
    K.put(g, K.heart('#ff8fab', 0.9), 304, 132, 12);
  } },
];

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'sticker');
const SIZE = 512;

// do nghe ve (chay trong Chrome): nhan vat lay tu js/chibi.js, them vai do vat nho
const KIT = `
  const { S, makeChar, heart, HEART, DROP } = Chibi;
  const ln = (d, w, col) => S('path', { d, fill: 'none', stroke: col, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const K = {
    S, makeChar, heart,
    put(g, el, x, y, rot = 0, s = 1) { const w = S('g', { transform: 'translate(' + x + ',' + y + ') rotate(' + rot + ') scale(' + s + ')' }, [el]); g.appendChild(w); return w; },
    star: (fill, r) => S('path', { d: 'M0,' + -r + ' Q' + r * 0.18 + ',' + -r * 0.18 + ' ' + r + ',0 Q' + r * 0.18 + ',' + r * 0.18 + ' 0,' + r + ' Q' + -r * 0.18 + ',' + r * 0.18 + ' ' + -r + ',0 Q' + -r * 0.18 + ',' + -r * 0.18 + ' 0,' + -r + 'Z', fill }),
    drop: (fill, s = 1) => S('path', { d: DROP, fill, transform: 'scale(' + s + ')' }),
    txt: (t, size, fill) => S('text', { 'text-anchor': 'middle', 'font-family': "'Baloo 2', sans-serif", 'font-weight': 800, 'font-size': size, fill }, [document.createTextNode(t)]),
    anger: (col) => S('g', {}, ['M-16,-5 Q-6,-6 -5,-16', 'M5,-16 Q6,-6 16,-5', 'M16,5 Q6,6 5,16', 'M-5,16 Q-6,6 -16,5'].map((d) => ln(d, 6, col))),
    moon: (fill) => S('path', { d: 'M10,-38 A38,38 0 1 0 10,38 A30,30 0 1 1 10,-38Z', fill }),
    sun: (fill) => S('g', {}, [...Array(12)].map((_, i) => S('path', { d: 'M-5,-46 L0,-62 L5,-46Z', fill: '#ffb627', transform: 'rotate(' + i * 30 + ')' }))
      .concat([S('circle', { r: 40, fill }), S('circle', { cx: -13, cy: -4, r: 3.5, fill: '#8a5a1a' }), S('circle', { cx: 13, cy: -4, r: 3.5, fill: '#8a5a1a' }), ln('M-10,10 Q0,18 10,10', 3, '#8a5a1a')])),
    blanket: () => S('g', {}, [S('rect', { x: -168, y: 0, width: 336, height: 160, rx: 46, fill: '#8fb3ee' }),
      ...[[-110, 40], [-40, 90], [40, 36], [110, 96], [-120, 120], [0, 132]].map(([x, y]) => S('circle', { cx: x, cy: y, r: 7, fill: '#fff', opacity: 0.85 })),
      S('path', { d: 'M-150,26 Q0,6 150,26', fill: 'none', stroke: '#c7d8f7', 'stroke-width': 10, 'stroke-linecap': 'round' })]),
    rose: () => S('g', {}, [ln('M0,0 L0,58', 5, '#3f9a52'), S('path', { d: 'M0,30 Q16,18 24,28 Q12,38 0,30Z', fill: '#58b368' }),
      S('circle', { cx: 0, cy: -6, r: 17, fill: '#e2283c' }), S('circle', { cx: -9, cy: -12, r: 10, fill: '#ff4d6d' }), S('circle', { cx: 8, cy: -13, r: 10, fill: '#ff4d6d' }), ln('M-6,-8 Q0,-14 6,-6', 2.5, '#a3152b')]),
    think: () => S('g', {}, [S('circle', { cx: -74, cy: 70, r: 7, fill: '#fff', stroke: '#e3d6dc', 'stroke-width': 3 }), S('circle', { cx: -56, cy: 48, r: 11, fill: '#fff', stroke: '#e3d6dc', 'stroke-width': 3 }),
      S('ellipse', { cx: 0, cy: 0, rx: 52, ry: 42, fill: '#fff', stroke: '#e3d6dc', 'stroke-width': 3 }), S('path', { d: HEART, fill: '#ff3d68', transform: 'translate(0,12) scale(1.5)' })]),
    boba: () => S('g', {}, [S('path', { d: 'M-24,-30 L24,-30 L18,36 Q0,42 -18,36Z', fill: '#e8c39e', stroke: '#8a5a3c', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      ...[[-10, 26], [2, 30], [12, 24], [-4, 18], [8, 14]].map(([x, y]) => S('circle', { cx: x, cy: y, r: 5, fill: '#3b2416' })),
      S('path', { d: 'M-28,-30 Q0,-52 28,-30Z', fill: '#fff', stroke: '#8a5a3c', 'stroke-width': 3, 'stroke-linejoin': 'round' }),
      S('rect', { x: 4, y: -78, width: 8, height: 44, rx: 3, fill: '#ff6b8a', transform: 'rotate(14)' }),
      S('path', { d: HEART, fill: '#ff6b8a', transform: 'translate(0,4) scale(0.7)' })]),
    check: () => S('g', {}, [S('circle', { r: 40, fill: '#3fbf6e' }), ln('M-18,0 L-5,14 L20,-14', 10, '#fff')]),
    speed: () => S('g', {}, [[-6, 0, 70], [10, 40, 56], [-14, 80, 64]].map(([x, y, w]) => ln('M' + x + ',' + y + ' L' + (x + w) + ',' + y, 8, '#ffc58a'))),
    blood: () => S('g', {}, [S('path', { d: DROP, fill: '#e63950', transform: 'scale(4.2)' }), S('path', { d: HEART, fill: '#fff', transform: 'translate(0,30) scale(1.5)' })]),
    cake: () => S('g', {}, [S('rect', { x: -56, y: -44, width: 112, height: 44, rx: 8, fill: '#ffd1dc' }), S('rect', { x: -40, y: -80, width: 80, height: 38, rx: 8, fill: '#fff0f4' }),
      S('path', { d: 'M-56,-30 Q-42,-20 -28,-30 Q-14,-20 0,-30 Q14,-20 28,-30 Q42,-20 56,-30', fill: 'none', stroke: '#fff', 'stroke-width': 5 }),
      S('text', { x: 0, y: -84, 'text-anchor': 'middle', 'font-family': "'Baloo 2', sans-serif", 'font-weight': 800, 'font-size': 52, fill: '#ff6b8a', stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, [document.createTextNode('1')]),
      S('path', { d: 'M0,-150 C6,-142 6,-136 0,-132 C-6,-136 -6,-142 0,-150Z', fill: '#ffb627' })]),
  };`;

function pageHtml() {
  const list = STICKERS.map((s) => {
    const src = s.draw.toString();
    return `{ text: ${JSON.stringify(s.text)}, color: ${JSON.stringify(s.color)}, draw: ${/^(function|\()/.test(src) ? src : 'function ' + src} }`;
  }).join(',\n');
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@800&family=Playfair+Display:wght@800&display=swap" rel="stylesheet">
<style>html, body { margin: 0; background: transparent; } svg { display: block; }</style></head><body>
<svg id="st" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <defs><filter id="cut" x="-15%" y="-15%" width="130%" height="130%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="9" result="d"/>
    <feGaussianBlur in="d" stdDeviation="3" result="b"/><feOffset in="b" dy="3" result="bo"/>
    <feFlood flood-color="#3b1a28" flood-opacity="0.22"/><feComposite in2="bo" operator="in" result="sh"/>
    <feFlood flood-color="#fff"/><feComposite in2="d" operator="in" result="w"/>
    <feMerge><feMergeNode in="sh"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter></defs>
  <g id="art" filter="url(#cut)"></g>
</svg>
<script src="file://${path.join(ROOT, 'js', 'chibi.js')}"></script>
<script>
  ${KIT}
  const LIST = [${list}];
  const PAD = 20, BASE = ${SIZE - 70};          // le (cho vien trang) / day hinh
  window.drawSticker = (i) => {
    const art = document.getElementById('art');
    art.innerHTML = '';
    const g = S('g'); art.appendChild(g);
    LIST[i].draw(g, K);
    // phong to / dich cho hinh vua khung, chan dat ngay tren dong chu
    const bb = g.getBBox(), k = Math.min((${SIZE} - 2 * PAD) / bb.width, (BASE - PAD) / bb.height, 1.6);
    g.setAttribute('transform', 'translate(${SIZE / 2},' + BASE + ') scale(' + k.toFixed(3) + ') translate(' + -(bb.x + bb.width / 2) + ',' + -(bb.y + bb.height) + ')');
    // chu phia duoi, dai qua thi thu nho cho vua
    const t = S('text', { x: ${SIZE / 2}, y: ${SIZE - 24}, 'text-anchor': 'middle', 'font-family': "'Baloo 2', sans-serif", 'font-weight': 800, 'font-size': 62,
      fill: LIST[i].color, stroke: '#fff', 'stroke-width': 10, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, [document.createTextNode(LIST[i].text)]);
    art.appendChild(t);
    const w = t.getComputedTextLength();
    if (w > ${SIZE - 44}) t.setAttribute('font-size', (62 * ${SIZE - 44} / w).toFixed(1));
    return true;
  };
  // nap san font cho DU chu co dau (font Google chia nhieu phan theo bang chu) roi moi chup
  const ALL = LIST.map((s) => s.text).join('') + 'Zz1';
  addEventListener('load', () => Promise.all([document.fonts.load('800 62px "Baloo 2"', ALL), document.fonts.load('800 24px "Playfair Display"', 'PH')])
    .then(() => document.fonts.ready).then(() => { window.READY = true; }));
</script></body></html>`;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sticker-'));
  const page = await openChrome({ width: SIZE, height: SIZE, scale: 2 });     // ve x2 roi thu nho -> vien muot
  process.on('SIGINT', () => { page.close(); process.exit(1); });
  try {
    const f = path.join(tmp, 'sticker.html');
    fs.writeFileSync(f, pageHtml());
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    if (!(await page.goto('file://' + f, 'window.READY === true'))) throw new Error('font chua tai xong (can mang)');
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUT, 'nho'), { recursive: true });
    const meta = [];
    for (let i = 0; i < STICKERS.length; i++) {
      const s = STICKERS[i], name = `${String(i + 1).padStart(2, '0')}-${s.id}`;
      await page.ev(`drawSticker(${i})`);
      const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: SIZE, height: SIZE, scale: 1 } });
      const big = await sharp(Buffer.from(r.result.data, 'base64')).resize(SIZE, SIZE, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(path.join(OUT, name + '.png'), big);
      await sharp(big).resize(256, 256).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, 'nho', name + '.webp'));
      meta.push({ id: s.id, text: s.text, png: `sticker/${name}.png`, nho: `sticker/nho/${name}.webp` });
      process.stdout.write(`\r  Ve sticker ${i + 1}/${STICKERS.length}   `);
    }
    fs.writeFileSync(path.join(OUT, 'sticker.json'), JSON.stringify(meta));
    // tai mot lan ca bo
    execFileSync('zip', ['-q', '-j', path.join(OUT, 'sticker-hai-dua.zip'), ...meta.map((m) => path.join(ROOT, m.png))]);
    const kb = meta.reduce((n, m) => n + fs.statSync(path.join(ROOT, m.png)).size, 0) / 1024;
    console.log(`\n  Da ghi ${meta.length} sticker vao sticker/ (${Math.round(kb)} KB) + sticker-hai-dua.zip`);
  } finally {
    page.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
