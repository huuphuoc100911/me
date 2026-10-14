#!/usr/bin/env node
/**
 * In an cho ngay 18/10: truyen tranh A5 "Mot nam cua chung minh" (16 trang) + thiep QR A6
 *
 *   npm run truyentranh     # -> truyen-tranh/*.pdf (mang ra tiem in) + truyen-tranh/*.webp
 *
 * Hinh ve lay tu chinh phim hoat hinh (chuyen-cua-chung-minh.html ?xuat&tranh), loi ke
 * va anh that cung lay tu STORY trong trang do — sua phim thi chay lai lenh nay la xong.
 * Moi trang chua le trang 7mm mau trang -> tiem in khong can "tran le", cat thang A5/A6.
 * Anh tung trang (trang-01.webp..., thiep-1/2.webp) de trang truyen-tranh.html lat xem tren web.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { openChrome } = require('./chrome.js');

// ★ Chu tren bia, trang tang va thiep — sua thoai mai
const BOOK = {
  title: 'Một năm<br>của chúng mình',
  names: 'Thị Huyền ❤️ Hữu Phước',
  dates: '18.10.2025 — 18.10.2026',
  dedication: [
    'Tặng em, Thị Huyền —',
    'cô gái áo xanh ở ngày hội hiến máu năm ấy.',
  ],
  intro: 'Cuốn truyện nhỏ này kể lại một năm của hai đứa: những ngày đặc biệt, và cả những ngày bình thường mà anh thương nhất.',
  sign: '— Anh, 18.10.2026',
  url: 'https://love.personal.io.vn',
  back: 'Quét mã để xem phim hoạt hình, rạp phim và cả thế giới nhỏ anh làm riêng cho em',
  sequel: 'Phần 2 — Năm thứ hai · khởi chiếu 18.10.2027',
  card: {
    front: 'Gửi em 💌',
    sub: 'Một năm của chúng mình',
    scan: 'Quét mã này nhé',
    back: 'Có cả một thế giới nhỏ anh làm riêng cho em — phim hoạt hình, rạp phim, lá thư, phiếu yêu thương…',
    sign: '♥ Anh',
  },
};

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'chuyen-cua-chung-minh.html');
const OUT = path.join(ROOT, 'truyen-tranh');
// khoanh khac dep nhat cua canh khong co anh that (ms tinh tu dau canh)
const MOMENT = { 'mo-dau': 4600, 'to-tinh': 4400, 'ket': 4300 };
const PANEL = { x: 0, y: 150, width: 540, height: 570 };    // vung tranh trong khung 540x960 cua phim

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">';
// ma QR ve bang SVG (qrcode-generator), xong het font + anh moi bao READY
const READY_JS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>
  document.querySelectorAll('[data-qr]').forEach((el) => {
    const q = qrcode(0, 'M'); q.addData(el.dataset.qr); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ',' + r + 'h1v1h-1z';
    el.innerHTML = '<svg viewBox="-4 -4 ' + (n + 8) + ' ' + (n + 8) + '" shape-rendering="crispEdges"><rect x="-4" y="-4" width="' + (n + 8) + '" height="' + (n + 8) + '" fill="#fff"/><path d="' + d + '" fill="#2b1a22"/></svg>';
  });
  Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]).then(() => { window.READY = true; });
</script>`;

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; overflow: hidden; break-after: page; background: #fff; }
  .frame { position: absolute; inset: 7mm; border-radius: 5mm; overflow: hidden; background: #fff7f2; border: 0.35mm solid #f2c2cf; }
  .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .pg { position: absolute; bottom: 3.5mm; left: 0; right: 0; text-align: center; font: 500 6.5pt 'Inter'; color: #c98fa2; letter-spacing: 1pt; }
`;

function bookHtml(scenes, img) {
  const chapters = scenes.filter((s) => !['mo-dau', 'ket'].includes(s.art));
  const ket = scenes.find((s) => s.art === 'ket');
  let pg = 2;
  const scenePage = (s, label, title) => `
  <section class="page a5"><div class="frame">
    <div class="hd"><span class="chap">${esc(label)}</span><span class="chip">${esc(s.date)}</span></div>
    <div class="ttl">${esc(title || s.title)}</div>
    <div class="panel"><img src="${img[s.art]}"></div>
    <p class="say">${esc(s.text)}</p>
    <div class="pg">— ${++pg} —</div>
  </div></section>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>${CSS}
  @page { size: 148mm 210mm; margin: 0; }
  .a5 { width: 148mm; height: 210mm; }
  .hd { position: absolute; left: 7mm; right: 7mm; top: 6mm; display: flex; justify-content: space-between; align-items: center; }
  .chap { font: 600 7pt 'Inter'; letter-spacing: 2.2pt; color: #e8456b; text-transform: uppercase; }
  .chip { font: 600 7pt 'Inter'; letter-spacing: 0.8pt; color: #b8325a; background: #fff; border: 0.3mm solid #f2c2cf; border-radius: 10mm; padding: 1.1mm 3mm; }
  .ttl { position: absolute; left: 7mm; right: 7mm; top: 11.5mm; font: 700 21pt/1.15 'Dancing Script'; color: #b0284f; }
  .panel { position: absolute; left: 7mm; right: 7mm; top: 24mm; height: ${(120 * PANEL.height / PANEL.width).toFixed(2)}mm;
    border-radius: 3.5mm; overflow: hidden; border: 0.6mm solid #3b2430; }
  .panel img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .say { position: absolute; left: 8mm; right: 8mm; top: 156mm; font: 500 10pt/1.6 'Inter'; color: #3b2430; }
  .say::before { content: '♥'; color: #ff6b8a; margin-right: 1.6mm; }
  /* KHONG dung text-shadow / box-shadow: trong PDF thanh o chu nhat mo, tiem in ra xau */
  /* bia */
  .cover .frame, .backc .frame { background: #1b1033; border: 0; }
  .cv-top { position: absolute; top: 15mm; left: 0; right: 0; text-align: center; color: #fff; }
  .cv-k { font: 600 6.5pt 'Inter'; letter-spacing: 3pt; text-transform: uppercase; color: #ffb3c6; }
  .cv-t { margin-top: 3mm; font: 700 34pt/1.05 'Dancing Script'; }
  .cv-bot { position: absolute; bottom: 9mm; left: 0; right: 0; text-align: center; color: #fff; }
  .cv-names { font: 700 15pt 'Dancing Script'; }
  .cv-dates { margin-top: 1.5mm; font: 600 7pt 'Inter'; letter-spacing: 1.6pt; color: #ffd1dc; }
  /* trang tang */
  .ded { position: absolute; inset: 0; padding: 22mm 14mm 0; text-align: center; color: #3b2430; }
  .ded .star { color: #e8456b; font-size: 10pt; letter-spacing: 3pt; }
  .ded .to { margin-top: 6mm; font: 700 17pt/1.35 'Dancing Script'; color: #b0284f; }
  .ded .intro { margin-top: 6mm; font: 400 9.5pt/1.65 'Inter'; color: #5a3a48; }
  .ded .vig { display: block; margin: 8mm auto 0; width: 62mm; height: 64mm; object-fit: cover; border-radius: 4mm; border: 0.6mm solid #3b2430; }
  .ded .once { margin-top: 7mm; font: italic 500 9.5pt/1.6 'Inter'; color: #7a4a5c; }
  .ded .sign { margin-top: 5mm; text-align: right; font: 700 14pt 'Dancing Script'; color: #b0284f; }
  /* bia sau */
  .bk-card { position: absolute; left: 50%; bottom: 14mm; transform: translateX(-50%); width: 78mm; padding: 6mm 6mm 5mm;
    background: #fff; border-radius: 4mm; text-align: center; color: #3b2430; border: 0.6mm solid #ffb3c6; }
  .bk-card .qr { width: 40mm; height: 40mm; margin: 0 auto; }
  .bk-card .qr svg { width: 100%; height: 100%; display: block; }
  .bk-card p { margin-top: 3mm; font: 500 7.5pt/1.5 'Inter'; }
  .bk-card .url { margin-top: 1.5mm; font: 600 7pt 'Inter'; color: #b8325a; letter-spacing: 0.4pt; }
  .bk-seq { position: absolute; top: 12mm; left: 0; right: 0; text-align: center; font: 700 15pt 'Dancing Script'; color: #fff; }
  </style></head><body>
  <section class="page a5 cover"><div class="frame">
    <img class="bg" src="${img.cover}">
    <div class="cv-top"><div class="cv-k">✦ Truyện tranh ✦</div><div class="cv-t">${BOOK.title}</div></div>
    <div class="cv-bot"><div class="cv-names">${esc(BOOK.names)}</div><div class="cv-dates">${esc(BOOK.dates)}</div></div>
  </div></section>
  <section class="page a5"><div class="frame"><div class="ded">
    <div class="star">✦ ✦ ✦</div>
    <div class="to">${BOOK.dedication.map(esc).join('<br>')}</div>
    <p class="intro">${esc(BOOK.intro)}</p>
    <img class="vig" src="${img.vignette}">
    <p class="once">${esc(scenes[0].text)}</p>
    <div class="sign">${esc(BOOK.sign)}</div>
  </div><div class="pg">— 2 —</div></div></section>
  ${chapters.map((s, k) => scenePage(s, `Chương ${k + 1}`)).join('')}
  ${ket ? scenePage(ket, 'Lời cuối', ket.title) : ''}
  <section class="page a5 backc"><div class="frame">
    <img class="bg" src="${img.back}">
    <div class="bk-seq">${esc(BOOK.sequel)}</div>
    <div class="bk-card"><div class="qr" data-qr="${esc(BOOK.url)}"></div><p>${esc(BOOK.back)}</p><div class="url">${esc(BOOK.url.replace(/^https?:\/\//, ''))}</div></div>
  </div></section>
  ${READY_JS}</body></html>`;
}

function cardHtml(img) {
  const c = BOOK.card;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>${CSS}
  @page { size: 105mm 148mm; margin: 0; }
  .a6 { width: 105mm; height: 148mm; }
  .a6 .frame { inset: 5mm; border-radius: 4mm; }
  .front .frame { border: 0; background: #ffe7a8; }
  .fr-bot { position: absolute; left: 0; right: 0; bottom: 6mm; text-align: center; color: #9e1f45; }
  .fr-bot b { display: block; font: 700 24pt 'Dancing Script'; }
  .fr-bot span { font: 700 6.5pt 'Inter'; letter-spacing: 2pt; text-transform: uppercase; }
  .bk { position: absolute; inset: 0; padding: 11mm 9mm 0; text-align: center; color: #3b2430; }
  .bk .scan { font: 700 19pt 'Dancing Script'; color: #b0284f; }
  .bk .qr { width: 52mm; height: 52mm; margin: 4mm auto 0; padding: 2mm; background: #fff; border-radius: 3mm; border: 0.4mm solid #f2c2cf; }
  .bk .qr svg { width: 100%; height: 100%; display: block; }
  .bk .url { margin-top: 2.5mm; font: 600 7pt 'Inter'; color: #b8325a; letter-spacing: 0.4pt; }
  .bk p { margin-top: 5mm; font: 500 8pt/1.6 'Inter'; color: #5a3a48; }
  .bk .sign { margin-top: 4mm; font: 700 14pt 'Dancing Script'; color: #b0284f; }
  </style></head><body>
  <section class="page a6 front"><div class="frame">
    <img class="bg" src="${img.card}">
    <div class="fr-bot"><b>${esc(c.front)}</b><span>${esc(c.sub)}</span></div>
  </div></section>
  <section class="page a6"><div class="frame"><div class="bk">
    <div class="scan">${esc(c.scan)}</div>
    <div class="qr" data-qr="${esc(BOOK.url)}"></div>
    <div class="url">${esc(BOOK.url.replace(/^https?:\/\//, ''))}</div>
    <p>${esc(c.back)}</p>
    <div class="sign">${esc(c.sign)}</div>
  </div></div></section>
  ${READY_JS}</body></html>`;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'truyentranh-'));
  // ve o do phan giai x4 (2160px ngang) -> in A5 van net (~400 dpi)
  const page = await openChrome({ width: 540, height: 960, scale: 4 });
  process.on('SIGINT', () => { page.close(); process.exit(1); });
  try {
    if (!(await page.goto('file://' + PAGE + '?xuat&tranh', 'window.READY === true'))) throw new Error('phim chua san sang (font / anh chua tai xong?)');
    const scenes = await page.ev('window.BOOK');
    const shot = async (file, sc, at, clip) => {
      await page.ev(`renderAt(${sc.start + Math.min(at, sc.dur - 300)}).then(() => 1)`);
      const r = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 93, clip: { ...clip, scale: 1 } });
      fs.writeFileSync(path.join(tmp, file), Buffer.from(r.result.data, 'base64'));
      return file;
    };
    const img = {};
    for (const s of scenes) {
      // canh co anh that: doi tat ca anh bay vao xong
      const at = MOMENT[s.art] || (s.photoAt != null ? s.photoAt + (s.photos.length - 1) * 560 + 1100 : s.dur * 0.6);
      img[s.art] = await shot(s.art + '.jpg', s, at, PANEL);
      process.stdout.write(`\r  Ve tranh ${Object.keys(img).length}/${scenes.length}   `);
    }
    const by = (a) => scenes.find((s) => s.art === a);
    img.cover = await shot('cover.jpg', by('mo-dau'), 4600, { x: 0, y: 100, width: 540, height: 766 });
    img.vignette = await shot('vignette.jpg', by('to-tinh'), 4400, { x: 110, y: 380, width: 320, height: 330 });
    img.back = await shot('back.jpg', by('ket'), 3800, { x: 0, y: 40, width: 540, height: 766 });
    img.card = await shot('card.jpg', by('ky-niem'), 1900, { x: 0, y: 60, width: 540, height: 783 });   // truoc luc ruy bang bay len

    fs.mkdirSync(OUT, { recursive: true });
    // PDF de in + anh tung trang (webp) de xem tren web
    const pdf = async (html, name, widthMm, snapName, snapPx) => {
      const f = path.join(tmp, name + '.html');
      fs.writeFileSync(f, html);
      if (!(await page.goto('file://' + f, 'window.READY === true'))) throw new Error(name + ': font / ma QR chua tai xong (can mang)');
      const r = await page.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      const out = path.join(OUT, name + '.pdf');
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
      await page.send('Emulation.setDeviceMetricsOverride', { width: Math.ceil((widthMm / 25.4) * 96), height: 900, deviceScaleFactor: 2, mobile: false });
      const rects = await page.ev(`[...document.querySelectorAll('.page')].map((e) => { const b = e.getBoundingClientRect(); return [b.left + scrollX, b.top + scrollY, b.width, b.height]; })`);
      for (let k = 0; k < rects.length; k++) {
        const [x, y, width, height] = rects[k];
        const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width, height, scale: 1 } });
        await sharp(Buffer.from(shot.result.data, 'base64')).resize({ width: snapPx }).webp({ quality: 82 })
          .toFile(path.join(OUT, snapName(k + 1)));
      }
      console.log(`\n  Da ghi ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB) + ${rects.length} anh trang`);
      return rects.length;
    };
    const pages = await pdf(bookHtml(scenes, img), 'truyen-tranh-mot-nam', 148, (k) => `trang-${String(k).padStart(2, '0')}.webp`, 1000);
    fs.writeFileSync(path.join(OUT, 'trang.json'), JSON.stringify({ pages }));   // truyen-tranh.html doc so trang
    await pdf(cardHtml(img), 'thiep-qr', 105, (k) => `thiep-${k}.webp`, 800);
  } finally {
    page.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
