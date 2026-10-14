#!/usr/bin/env node
/**
 * Hai to A4 de in cho ngay 18/10:
 *   - 12 anh polaroid mini (ngay + mot dong chu) — cat ra dan tuong / bo hop qua
 *   - Xap phieu yeu thuong bang giay: 10 phieu + bia + cach dung, moi phieu mot ma QR
 *     mo thang phieu do tren web (phieu-yeu-thuong.html?p=<id>) -> bam "Dung phieu" la anh nhan mail
 *
 *   npm run doin     # -> do-in/polaroid-a4.pdf, do-in/phieu-giay-a4.pdf (+ anh xem truoc .webp)
 *
 * Loi hua tren phieu lay tu COUPONS trong phieu-yeu-thuong.html (sua o do roi chay lai lenh).
 * Moi to chua le 8-10mm: tiem in in thang A4, khong can tran le.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { openChrome } = require('./chrome.js');

// ★ 12 anh polaroid (theo thu tu thoi gian) — doi anh / sua chu thoai mai
//   f: file trong images/love/ (video thi dung anh nho thumbs/<ten>.webp)
const PHOTOS = [
  { f: '24-08-25.jpg', date: '24.08.2025', cap: 'Ngày hội hiến máu năm ấy' },
  { f: 'anhsinhnhatemvsbanthan.jpg', date: '23.10.2025', cap: 'Sinh nhật đầu tiên bên em' },
  { f: 'chupphotobook.jpg', date: '12.2025', cap: 'Chen nhau vào buồng chụp ảnh' },
  { f: 'muadong2025.jpg', date: '12.2025', cap: 'Mùa đông đầu tiên' },
  { f: 'thumbs/100days.webp', date: '26.01.2026', cap: 'Tròn 100 ngày' },
  { f: 'valentine2.jpg', date: '14.02.2026', cap: 'Valentine đầu tiên' },
  { f: 'anhemditructhang42026.jpg', date: '04.2026', cap: 'Em đi trực vẫn xinh' },
  { f: 'dichoithang52026.jpg', date: '05.2026', cap: 'Một ngày bình thường' },
  { f: 'le2:9:3.jpg', date: '02.09.2026', cap: 'Đồi thông ngày 2/9' },
  { f: 'hienmau-em-10lan-anh-15lan.jpg', date: '06.09.2026', cap: 'Em 10 lần, anh 15 lần' },
  { f: 'xemphimsinhnhatanh.jpg', date: '09.10.2026', cap: 'Sinh nhật anh' },
  { f: 'aodoidautiencuaanhvsem.jpg', date: '18.10.2026', cap: 'Áo đôi đầu tiên' },
];
// ★ Chu tren bia xap phieu va the huong dan
const PHIEU = {
  title: 'Xấp phiếu yêu thương',
  sub: '10 lời hứa của anh · tặng Thị Huyền',
  date: '18.10.2026',
  url: 'https://love.personal.io.vn/phieu-yeu-thuong.html?p=',
  how: ['Chọn một phiếu em muốn dùng', 'Mở camera điện thoại, quét mã QR trên phiếu', 'Bấm “Dùng phiếu này” — anh nhận được ngay'],
  keep: 'Dùng xong đưa phiếu cho anh giữ làm kỷ niệm nha ❤️',
};

const ROOT = path.join(__dirname, '..');
const MEDIA = path.join(ROOT, 'images', 'love');
const OUT = path.join(ROOT, 'do-in');

const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@700;800&family=Patrick+Hand&display=swap" rel="stylesheet">';
// ma QR ve bang SVG (qrcode-generator), xong het font + anh moi bao READY
const READY_JS = `<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>
  document.querySelectorAll('[data-qr]').forEach((el) => {
    const q = qrcode(0, 'M'); q.addData(el.dataset.qr); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ',' + r + 'h1v1h-1z';
    el.innerHTML = '<svg viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" shape-rendering="crispEdges"><rect x="-2" y="-2" width="' + (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#2b1a22"/></svg>';
  });
  // doi trang tai xong, nap du chu co dau cua tung font roi moi in
  const txt = document.body.innerText;
  addEventListener('load', () => Promise.all(["11pt 'Patrick Hand'", "800 11pt 'Playfair Display'", "700 13pt 'Dancing Script'", "400 7pt Inter", "500 7pt Inter", "600 7pt Inter", "700 7pt Inter"]
    .map((f) => document.fonts.load(f, txt)).concat([...document.images].map((i) => i.decode().catch(() => {}))))
    .then(() => document.fonts.ready).then(() => { window.READY = true; }));
</script>`;
// KHONG dung text-shadow / box-shadow: trong PDF thanh o chu nhat mo, tiem in ra xau
const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: 210mm 297mm; margin: 0; }
  html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; background: #fff; display: grid; justify-content: center; align-content: center; }
`;

function polaroidHtml(imgs) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
  .page { grid-template-columns: repeat(3, 60mm); grid-auto-rows: 68mm; gap: 3mm 5mm; }
  .pola { position: relative; background: #fff; border: 0.25mm solid #d9cfd3; border-radius: 0.8mm; }
  .pola img { position: absolute; left: 4mm; top: 4mm; width: 52mm; height: 52mm; object-fit: cover; display: block; }
  .pola .cap { position: absolute; left: 3mm; right: 3mm; top: 56.6mm; text-align: center; font: 11pt/1 'Patrick Hand'; color: #3b2430; white-space: nowrap; }
  .pola .date { position: absolute; left: 3mm; right: 3mm; top: 61.6mm; text-align: center; font: 8.5pt/1 'Patrick Hand'; color: #c0406a; letter-spacing: 0.6pt; }
  .pola .date::before { content: '♥ '; color: #ff6b8a; }
  </style></head><body><section class="page">
  ${PHOTOS.map((p, i) => `<div class="pola"><img src="${imgs[i]}"><div class="cap">${esc(p.cap)}</div><div class="date">${esc(p.date)}</div></div>`).join('')}
  </section>${READY_JS}</body></html>`;
}

function couponsHtml(coupons) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const ticket = (c, i) => `<div class="tk">
    <div class="stub"><div class="ic">${c.icon}</div><div class="no">#${pad2(i + 1)}</div></div>
    <div class="mid"><div class="k">Phiếu yêu thương</div><div class="t">${esc(c.title)}</div><div class="n">${esc(c.note)}</div><div class="hd">Hạn dùng: mãi mãi</div></div>
    <div class="qrc"><div class="qr" data-qr="${esc(PHIEU.url + c.id)}"></div><div class="sc">Quét để dùng</div></div>
  </div>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>${BASE_CSS}
  .page { grid-template-columns: repeat(2, 93mm); grid-auto-rows: 44mm; gap: 3mm 4mm; }
  .tk { position: relative; display: flex; background: #fff6e8; border: 0.3mm solid #e6c7a6; border-radius: 3mm; overflow: hidden; color: #3d1622; }
  /* rang cua ve: hai nua hinh tron khoet tren / duoi duong xe */
  .tk::before, .tk::after { content: ''; position: absolute; left: 21.5mm; width: 5mm; height: 5mm; border-radius: 50%; background: #fff; border: 0.3mm solid #e6c7a6; }
  .tk::before { top: -2.8mm; } .tk::after { bottom: -2.8mm; }
  .stub { flex: none; width: 24mm; background: #ffe1ea; border-right: 0.35mm dashed #d99aac; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.5mm; }
  .stub .ic { font-size: 25pt; line-height: 1; }
  .stub .no { font: 700 7pt 'Inter'; letter-spacing: 1pt; color: #b0144a; }
  .mid { flex: 1; min-width: 0; padding: 3.6mm 2mm 3mm 3.4mm; display: flex; flex-direction: column; }
  .mid .k { font: 700 5.6pt 'Inter'; letter-spacing: 1.4pt; text-transform: uppercase; color: #d0406a; }
  .mid .t { margin-top: 1.2mm; font: 800 11.5pt/1.15 'Playfair Display'; }
  .mid .n { margin-top: 1.4mm; font: 400 6.8pt/1.4 'Inter'; color: #5a2a36; }
  .mid .hd { margin-top: auto; font: 500 5.6pt 'Inter'; color: #9a6a74; }
  .qrc { flex: none; width: 24mm; padding: 4mm 3mm 0 0; text-align: center; }
  .qr { width: 21mm; height: 21mm; }
  .qr svg { display: block; width: 100%; height: 100%; }
  .sc { margin-top: 1.2mm; font: 600 5.6pt 'Inter'; color: #b0144a; letter-spacing: 0.4pt; }
  /* bia + huong dan */
  .cover { background: linear-gradient(135deg, #f8dd7a 0%, #e2b04a 40%, #fbe7a1 62%, #d39a35 100%); border-color: #d6a548; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #5a3204; }
  .cover::before, .cover::after { display: none; }
  .cover .k { font: 700 5.8pt 'Inter'; letter-spacing: 2pt; text-transform: uppercase; }
  .cover .t { margin-top: 1mm; font: 700 21pt/1.1 'Dancing Script'; color: #8a1c3e; }
  .cover .s { margin-top: 1.2mm; font: 500 7pt 'Inter'; }
  .cover .d { margin-top: 1.6mm; font: 700 6.5pt 'Inter'; letter-spacing: 1.2pt; }
  .how { flex-direction: column; padding: 4mm 5mm; background: #fff; }
  .how::before, .how::after { display: none; }
  .how .t { font: 700 13pt 'Dancing Script'; color: #b0284f; }
  .how ol { margin-top: 1.4mm; padding-left: 4.2mm; font: 500 7pt/1.55 'Inter'; color: #3b2430; }
  .how p { margin-top: auto; font: 500 6.6pt/1.4 'Inter'; color: #9a3d58; }
  </style></head><body><section class="page">
  <div class="tk cover"><div class="k">✦ Quà kỷ niệm 1 năm ✦</div><div class="t">${esc(PHIEU.title)}</div><div class="s">${esc(PHIEU.sub)}</div><div class="d">${esc(PHIEU.date)}</div></div>
  ${coupons.map(ticket).join('')}
  <div class="tk how"><div class="t">Cách dùng phiếu</div><ol>${PHIEU.how.map((h) => `<li>${esc(h)}</li>`).join('')}</ol><p>${esc(PHIEU.keep)}</p></div>
  </section>${READY_JS}</body></html>`;
}

/** COUPONS trong phieu-yeu-thuong.html -> mang (trang web va phieu giay dung chung) */
function readCoupons() {
  const html = fs.readFileSync(path.join(ROOT, 'phieu-yeu-thuong.html'), 'utf8');
  const m = html.match(/const COUPONS = (\[[\s\S]*?\n\s*\]);/);
  if (!m) throw new Error('khong doc duoc COUPONS trong phieu-yeu-thuong.html');
  return new Function('return ' + m[1])();
}

async function main() {
  const coupons = readCoupons();
  if (coupons.length !== 10) console.warn(`  ! Co ${coupons.length} phieu (to A4 xep vua 10 phieu + bia + huong dan)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doin-'));
  const page = await openChrome({ width: 800, height: 1100, scale: 2 });
  process.on('SIGINT', () => { page.close(); process.exit(1); });
  try {
    // anh vuong cho polaroid: cat tu dong vao cho "dang chu y" nhat (mat nguoi...), ~440 dpi
    const imgs = [];
    for (const [i, p] of PHOTOS.entries()) {
      const src = path.join(MEDIA, p.f);
      if (!fs.existsSync(src)) throw new Error('khong thay images/love/' + p.f);
      const out = path.join(tmp, `p${i}.jpg`);
      await sharp(src).rotate().resize(900, 900, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 90 }).toFile(out);
      imgs.push('file://' + out);
    }
    fs.mkdirSync(OUT, { recursive: true });
    const pdf = async (html, name) => {
      const f = path.join(tmp, name + '.html');
      fs.writeFileSync(f, html);
      if (!(await page.goto('file://' + f, 'window.READY === true'))) throw new Error(name + ': font / ma QR chua tai xong (can mang)');
      const r = await page.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
      const out = path.join(OUT, name + '.pdf');
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
      // anh xem truoc cho trang qua-nho.html
      const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: (210 / 25.4) * 96, height: (297 / 25.4) * 96, scale: 1 } });
      await sharp(Buffer.from(shot.result.data, 'base64')).resize({ width: 1000 }).webp({ quality: 84 }).toFile(path.join(OUT, name + '.webp'));
      console.log(`  Da ghi ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
    };
    await pdf(polaroidHtml(imgs), 'polaroid-a4');
    await pdf(couponsHtml(coupons), 'phieu-giay-a4');
  } finally {
    page.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error('\nLoi:', e.message); process.exit(1); });
