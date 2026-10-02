/**
 * Nhan loi uoc sao bang (365-vi-sao.html) va thu tra loi (la-thu-niem-phong.html)
 * roi gui ve mail anh. Dung chung bien moi truong voi api/notify.js:
 * GMAIL_USER, GMAIL_APP_PASSWORD, GMAIL_TO.
 *
 *   POST /api/notify   { kind: 'wish' | 'reply', text: '...' }
 *
 * Dau "_" de Vercel khong tinh file nay la mot function rieng (goi Hobby toi da
 * 12 function) — api/notify.js nhan POST roi chuyen sang day.
 */
const nodemailer = require('nodemailer');

const KINDS = {
  wish:  { icon: '🌠', subject: 'Em vừa ước một điều trên sao băng', title: 'Điều ước của em' },
  reply: { icon: '💌', subject: 'Em viết thư trả lời anh', title: 'Thư em gửi anh' },
};
const MAX_LEN = 4000;

// Trang de cong khai nen chan bam lien tuc: moi IP toi da LIMIT lan trong WINDOW_MS.
// Chi nho trong mot phien may chu (Vercel co the tao phien moi) — du de chan nghich dai.
const LIMIT = 8;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();

function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > LIMIT;
}

const esc = (v) => String(v).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailHTML(kind, text, when) {
  const k = KINDS[kind];
  const body = esc(text).replace(/\n/g, '<br>');
  return `
    <div style="font-family:Georgia,'Times New Roman',serif; background:#10070f; padding:28px 16px;">
      <div style="max-width:520px; margin:0 auto; background:#fffaf3; border-radius:14px; padding:28px 26px; color:#3a1a24;">
        <div style="font-size:30px; text-align:center;">${k.icon}</div>
        <div style="text-align:center; font-size:20px; color:#b0144a; margin-top:6px;">${k.title}</div>
        <div style="text-align:center; font-size:12px; color:#9a7a80; margin-top:4px;">${esc(when)}</div>
        <div style="margin-top:20px; font-size:17px; line-height:1.7; white-space:normal;">${body}</div>
        <div style="margin-top:24px; text-align:center; font-size:12px; color:#9a7a80;">— gửi từ love.personal.io.vn 💕</div>
      </div>
    </div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Chỉ nhận POST' });
  }

  let data = req.body;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  const kind = data && data.kind;
  const text = data && typeof data.text === 'string' ? data.text.trim() : '';
  if (!KINDS[kind] || !text || text.length > MAX_LEN) {
    return res.status(400).json({ ok: false, error: 'Nội dung không hợp lệ' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (tooMany(ip)) return res.status(429).json({ ok: false, error: 'Gửi nhiều quá, đợi chút nha' });

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return res.status(500).json({ ok: false, error: 'Chưa cấu hình mail' });
  }

  const when = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date());

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.sendMail({
      from: `"Tình yêu của chúng mình" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_TO || process.env.GMAIL_USER,
      subject: `${KINDS[kind].icon} ${KINDS[kind].subject}`,
      text: `${KINDS[kind].title} — ${when}\n\n${text}`,
      html: emailHTML(kind, text, when),
    });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('love-note error:', error);
    return res.status(500).json({ ok: false, error: 'Không gửi được mail' });
  }
};
