const nodemailer = require('nodemailer');

// ══════════════════════════════════════════════════════════
// LUNAR CALENDAR (Ho Ngoc Duc's algorithm)
// ══════════════════════════════════════════════════════════

const PI = Math.PI;

function jdFromDate(dd, mm, yy) {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) {
    jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  return jd;
}

function NewMoon(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 -= 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 += 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 -= 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 -= 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 += 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  let deltat;
  if (T < -11) {
    deltat = 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3;
  } else {
    deltat = -0.000278 + 0.000265 * T + 0.000262 * T2;
  }
  return Jd1 + C1 - deltat;
}

function SunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L -= PI * 2 * Math.floor(L / (PI * 2));
  return L;
}

function getSunLongitude(dayNumber, timeZone) {
  return Math.floor(SunLongitude(dayNumber - 0.5 - timeZone / 24) / PI * 6);
}

function getNewMoonDay(k, timeZone) {
  return Math.floor(NewMoon(k) + 0.5 + timeZone / 24);
}

function getLunarMonth11(yy, timeZone) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = getNewMoonDay(k, timeZone);
  const sunLong = getSunLongitude(nm, timeZone);
  if (sunLong >= 9) nm = getNewMoonDay(k - 1, timeZone);
  return nm;
}

function getLeapMonthOffset(a11, timeZone) {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  do {
    last = arc;
    i++;
    arc = getSunLongitude(getNewMoonDay(k + i, timeZone), timeZone);
  } while (arc !== last && i < 14);
  return i - 1;
}

function convertSolar2Lunar(dd, mm, yy, timeZone) {
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, timeZone);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, timeZone);
  let a11 = getLunarMonth11(yy, timeZone);
  let b11 = a11;
  let lunarYear;
  if (a11 >= monthStart) {
    lunarYear = yy;
    a11 = getLunarMonth11(yy - 1, timeZone);
  } else {
    lunarYear = yy + 1;
    b11 = getLunarMonth11(yy + 1, timeZone);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let lunarLeap = 0;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, timeZone);
    if (diff >= leapMonthDiff) {
      lunarMonth = diff + 10;
      if (diff === leapMonthDiff) lunarLeap = 1;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return [lunarDay, lunarMonth, lunarYear, lunarLeap];
}

const CAN = ['Canh','Tân','Nhâm','Quý','Giáp','Ất','Bính','Đinh','Mậu','Kỷ'];
const CHI = ['Thân','Dậu','Tuất','Hợi','Tý','Sửu','Dần','Mão','Thìn','Tỵ','Ngọ','Mùi'];
const WEEKDAYS = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];

function getCanChi(year) {
  return CAN[year % 10] + ' ' + CHI[year % 12];
}

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
      subject: `📅 Ngày ${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')} — Âm lịch: ${lDay}/${lMonth} ${canChiYear}`,
      html: emailHTML,
    });

    return res.status(200).json({
      success: true,
      message: `Email sent for ${day}/${month}/${year} — Lunar: ${lDay}/${lMonth}/${lYear}`,
    });
  } catch (error) {
    console.error('Notify error:', error);
    return res.status(500).json({ error: error.message });
  }
};
