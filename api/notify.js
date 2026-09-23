const nodemailer = require('nodemailer');
const Lunar = require('../js/lunar.js');
const Milestones = require('../js/milestones.js');

const { convertSolar2Lunar, getCanChi, WEEKDAYS } = Lunar;

const REMIND_DAYS = 3;   // nhac truoc bao nhieu ngay

// ══════════════════════════════════════════════════════════
// API HANDLER
// ══════════════════════════════════════════════════════════

module.exports = async function handler(req, res) {
  // Verify cron secret (optional but recommended)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow if no CRON_SECRET is set (for testing)
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Get current date in Vietnam timezone
    const now = new Date();
    const vnFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    });
    const parts = vnFormatter.formatToParts(now);
    const get = (type) => parseInt(parts.find(p => p.type === type).value);
    const day = get('day'), month = get('month'), year = get('year');
    const hour = get('hour'), minute = get('minute');

    const vnDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const weekday = WEEKDAYS[vnDate.getDay()];

    // Lunar date
    const lunar = convertSolar2Lunar(day, month, year, 7);
    const [lDay, lMonth, lYear, lLeap] = lunar;
    const leapStr = lLeap ? ' (Nhuận)' : '';
    const canChiYear = getCanChi(lYear);

    // ── Moc ky niem trong vong REMIND_DAYS ngay toi ──────────
    const upcoming = Milestones.upcomingFrom({ y: year, m: month, d: day }, REMIND_DAYS);
    const whenText = (n) => (n === 0 ? 'Hôm nay!' : n === 1 ? 'Ngày mai' : `Còn ${n} ngày`);
    const milestoneHTML = upcoming.length ? `
        <div style="margin-top:16px; background:linear-gradient(135deg,#3d1525,#2d1525); border:1px solid #f43f5e; border-radius:14px; padding:20px;">
          <div style="text-align:center; font-size:12px; color:#fb7185; text-transform:uppercase; letter-spacing:1px; margin-bottom:14px;">
            💕 Kỷ niệm sắp tới
          </div>
          ${upcoming.map((m) => `
          <div style="padding:10px 0; border-top:1px solid rgba(255,255,255,0.1);">
            <div style="color:#fde68a; font-size:16px; font-weight:bold;">${m.icon} ${m.name}</div>
            <div style="color:rgba(255,255,255,0.55); font-size:13px; margin-top:4px;">
              ${m.date} — <span style="color:#fb7185; font-weight:bold;">${whenText(m.daysLeft)}</span>
            </div>
          </div>`).join('')}
          <div style="text-align:center; margin-top:14px;">
            <a href="https://love.personal.io.vn/" style="display:inline-block; padding:10px 22px; background:#f43f5e; color:#fff; text-decoration:none; border-radius:999px; font-size:13px; font-weight:bold;">Mở trang kỷ niệm 💕</a>
          </div>
        </div>` : '';

    // Build email content
    const emailHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#0d0d1a; font-family:Arial,sans-serif;">
      <div style="max-width:500px; margin:0 auto; padding:30px 20px;">

        <!-- Header -->
        <div style="text-align:center; padding-bottom:24px; border-bottom:1px solid #2a2a4a;">
          <div style="font-size:40px; margin-bottom:8px;">🕐</div>
          <h1 style="color:#a78bfa; font-size:22px; margin:0;">Thông báo hàng ngày</h1>
          <p style="color:rgba(255,255,255,0.45); font-size:13px; margin-top:6px;">
            ${weekday}, ${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year} — ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}
          </p>
        </div>

        <!-- Solar Date -->
        <div style="margin-top:24px; background:#1e1e34; border:1px solid #2a2a4a; border-radius:14px; padding:20px; text-align:center;">
          <div style="font-size:28px; margin-bottom:6px;">☀️</div>
          <div style="color:rgba(255,255,255,0.45); font-size:12px; text-transform:uppercase; letter-spacing:1px;">Dương Lịch</div>
          <div style="color:#60a5fa; font-size:36px; font-weight:bold; margin:8px 0;">${String(day).padStart(2,'0')}</div>
          <div style="color:#e8e8f0; font-size:15px;">Tháng ${month}, ${year}</div>
          <div style="color:rgba(255,255,255,0.45); font-size:13px; margin-top:4px;">${weekday}</div>
        </div>

        <!-- Lunar Date -->
        <div style="margin-top:16px; background:#1e1e34; border:1px solid #2a2a4a; border-radius:14px; padding:20px; text-align:center;">
          <div style="font-size:28px; margin-bottom:6px;">🌙</div>
          <div style="color:rgba(255,255,255,0.45); font-size:12px; text-transform:uppercase; letter-spacing:1px;">Âm Lịch</div>
          <div style="color:#fbbf24; font-size:36px; font-weight:bold; margin:8px 0;">${String(lDay).padStart(2,'0')}</div>
          <div style="color:#e8e8f0; font-size:15px;">Tháng ${lMonth}${leapStr}, năm ${canChiYear}</div>
          <div style="color:rgba(255,255,255,0.45); font-size:13px; margin-top:4px;">Năm ${canChiYear} (${lYear})</div>
        </div>

        ${milestoneHTML}

        <!-- Footer -->
        <div style="text-align:center; margin-top:24px; padding-top:20px; border-top:1px solid #2a2a4a;">
          <p style="color:rgba(255,255,255,0.3); font-size:11px; margin:0;">
            Gửi tự động lúc 17:00 hàng ngày — Múi giờ Việt Nam (UTC+7)
          </p>
        </div>

      </div>
    </body>
    </html>`;

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"Lịch Việt Nam" <${process.env.GMAIL_USER}>`,
      to: process.env.GMAIL_TO || process.env.GMAIL_USER,
      subject: upcoming.length
        ? `${upcoming[0].icon} ${whenText(upcoming[0].daysLeft)} — ${upcoming[0].name}`
        : `📅 Ngày ${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')} — Âm lịch: ${lDay}/${lMonth} ${canChiYear}`,
      html: emailHTML,
    });

    return res.status(200).json({
      success: true,
      message: `Email sent for ${day}/${month}/${year} — Lunar: ${lDay}/${lMonth}/${lYear}`,
      milestones: upcoming.map((m) => `${m.name} (${whenText(m.daysLeft)})`),
    });
  } catch (error) {
    console.error('Notify error:', error);
    return res.status(500).json({ error: error.message });
  }
};
