/**
 * Ma hoa noi dung thu gui tuong lai.
 *
 * MUC DICH: giu bat ngo — noi dung thu khong hien ra khi xem ma nguon trang
 * hay mo file data/letters.json. KHONG PHAI bao mat that: khoa duoc suy ra tu
 * ngay mo (ai cung biet), nen nguoi co chu dich van giai duoc. Du dung cho
 * viec khong lo tay thay truoc mon qua.
 *
 * Dung chung cho tools/letter.js (Node) va love.html (trinh duyet).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Letters = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  const SALT = 'thihuyen-huuphuoc';

  /** Khoa suy ra tu ngay mo + muoi, tron len cho kho doan */
  function keyBytes(openAt) {
    const src = SALT + '|' + openAt + '|' + SALT;
    const enc = new TextEncoder().encode(src);
    const out = new Uint8Array(enc.length);
    let h = 0x9e37;
    for (let i = 0; i < enc.length; i++) {
      h = (h * 31 + enc[i] + i) & 0xffff;
      out[i] = (enc[i] ^ (h & 0xff) ^ ((h >> 8) & 0xff)) & 0xff;
    }
    return out;
  }

  function xor(bytes, key) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ key[i % key.length];
    return out;
  }

  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  /** Van ban -> chuoi ma hoa */
  function encode(text, openAt) {
    return toB64(xor(new TextEncoder().encode(text), keyBytes(openAt)));
  }

  /** Chuoi ma hoa -> van ban */
  function decode(payload, openAt) {
    try {
      return new TextDecoder().decode(xor(fromB64(payload), keyBytes(openAt)));
    } catch {
      return '';
    }
  }

  /** Da toi ngay mo chua (so sanh theo ngay dia phuong, khong theo gio) */
  function isOpen(openAt, now) {
    const [y, m, d] = openAt.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today = now ? new Date(now) : new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime() >= target.getTime();
  }

  /** So ngay con lai toi ngay mo (0 neu da mo) */
  function daysLeft(openAt, now) {
    const [y, m, d] = openAt.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const today = now ? new Date(now) : new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((target - today) / 86400000));
  }

  return { encode, decode, isOpen, daysLeft };
}));
