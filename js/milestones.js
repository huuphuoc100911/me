/**
 * Cac moc ky niem cua Thi Huyen & Huu Phuoc — nguon du lieu DUY NHAT.
 * Dung chung cho trang love.html (window.Milestones) va ham gui email
 * api/notify.js (require). Sua o day la ca hai noi cung doi.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Milestones = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  const DAY = 86400000;

  // Ngay bat dau yeu nhau (gio dia phuong cua may dang chay)
  const START_Y = 2025, START_M = 10, START_D = 18;
  const START = new Date(START_Y, START_M - 1, START_D).getTime();

  /** Su kien ca nhan. yearly: lap lai hang nam. */
  const PERSONAL = [
    { icon: '💘', name: 'Ngày đầu yêu nhau',              d: '2025-10-18' },
    { icon: '🎂', name: 'Sinh nhật em — Thị Huyền 🎉',    d: '2025-10-23', yearly: true },
    { icon: '🎂', name: 'Sinh nhật anh — Hữu Phước 🎉',   d: '2025-10-09', yearly: true },
    { icon: '⛄', name: 'Giáng Sinh cùng nhau',           d: '2025-12-25', yearly: true },
    { icon: '🎆', name: 'Năm mới bên nhau',                d: '2026-01-01', yearly: true },
    { icon: '💝', name: 'Valentine',                        d: '2026-02-14', yearly: true },
    { icon: '💇', name: 'Hiến tóc lần 2 cùng Thị Huyền',  d: '2026-05-03' },
  ];

  const pad2 = (n) => String(n).padStart(2, '0');
  const fmtVN = (dt) => `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  const dayKey = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  /** Cong n thang, tu lui ve cuoi thang neu thang dich ngan hon (31/01 + 1 -> 28/02) */
  function addMonths(dt, n) {
    const r = new Date(dt.getTime());
    const d = r.getDate();
    r.setMonth(r.getMonth() + n);
    if (r.getDate() < d) r.setDate(0);
    return r;
  }

  /**
   * Sinh toan bo moc: su kien ca nhan + moc 100 ngay + tron thang (nam dau)
   * + tron nam. Sinh truoc `yearsAhead` nam ke tu hom nay nen khong bao gio het.
   */
  function build(opts) {
    const o = opts || {};
    const startTs = o.startTs || START;
    const yearsAhead = o.yearsAhead || 3;
    const startDt = new Date(startTs);
    const horizon = Date.now() + yearsAhead * 365.25 * DAY;
    const out = [];
    const add = (icon, name, dt) =>
      out.push({ icon, name, date: fmtVN(dt), ts: dt.getTime(), key: dayKey(dt) });

    PERSONAL.forEach((ev) => {
      const [y, m, d] = ev.d.split('-').map(Number);
      if (!ev.yearly) { add(ev.icon, ev.name, new Date(y, m - 1, d)); return; }
      for (let yy = y; ; yy++) {
        const dt = new Date(yy, m - 1, d);
        if (dt.getTime() > horizon) break;
        if (dt.getTime() >= startTs) add(ev.icon, ev.name, dt);
      }
    });

    for (let n = 100; ; n += 100) {                 // moc tram ngay
      const dt = new Date(startTs + n * DAY);
      if (dt.getTime() > horizon) break;
      add(n % 1000 === 0 ? '💎' : n % 500 === 0 ? '🏆' : '🔥', `Tròn ${n} ngày bên nhau`, dt);
    }

    for (let n = 1; n <= 11; n++) {                 // tron thang, chi nam dau
      add('🌷', `Tròn ${n} tháng bên nhau`, addMonths(startDt, n));
    }

    for (let n = 1; ; n++) {                        // tron nam
      const dt = addMonths(startDt, n * 12);
      if (dt.getTime() > horizon) break;
      add(n === 1 ? '🌹' : '💞', `Kỷ niệm ${n} năm yêu nhau`, dt);
    }

    return out.sort((a, b) => a.ts - b.ts);
  }

  /**
   * Moc roi vao khoang [hom nay, hom nay + withinDays] — dung de nhac truoc.
   * So sanh theo chuoi ngay nen khong dinh loi lech mui gio.
   * @param {{y:number,m:number,d:number}} today ngay hom nay theo gio Viet Nam
   */
  function upcomingFrom(today, withinDays, list) {
    const ms = list || build();
    const base = new Date(today.y, today.m - 1, today.d);
    const wanted = new Map();
    for (let i = 0; i <= withinDays; i++) {
      const dt = new Date(base.getTime());
      dt.setDate(dt.getDate() + i);
      wanted.set(dayKey(dt), i);
    }
    return ms
      .filter((m) => wanted.has(m.key))
      .map((m) => Object.assign({ daysLeft: wanted.get(m.key) }, m))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  return { DAY, START, PERSONAL, pad2, fmtVN, dayKey, addMonths, build, upcomingFrom };
}));
