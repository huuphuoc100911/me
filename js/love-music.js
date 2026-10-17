/**
 * Danh sach nhac nen dung chung cho love.html va cac trang qua.
 *  - Moi trang (love.html, cac trang qua, phim hoat hinh tren web) phat NGAU NHIEN trong ca danh sach.
 *  - Muon trang nao co bai rieng thi them vao PAGE_SONG ben duoi (bai do phat truoc, roi ngau nhien).
 * Them / xoa bai: tha file nhac (mp3, m4a...) vao music/love roi chay `npm run music`
 * (tools/music.js doi ten file thanh chu thuong khong dau, chuyen mp3 128 kbps, viet lai SONGS).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LoveMusic = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  const SONGS = [
    'music/love/den-khi-nao.mp3',
    'music/love/giai-cuu-the-gioi.mp3',
    'music/love/vay-cuoi.mp3',
    'music/love/yeu-em-hon-moi-ngay.mp3',
    'music/love/you-are-my-crush.mp3',
  ];

  // ★ Bai rieng cho tung trang (tuy chon): trang -> tu khoa trong ten file, vd 'mon-qua-cuoi': 'mot-doi'.
  //   De TRONG = moi trang phat ngau nhien trong ca danh sach (nguoi dung chon vay 2026-10-17).
  const PAGE_SONG = {};

  /** Ban sao cua SONGS da tron ngau nhien (Fisher-Yates) */
  function shuffled() {
    const list = SONGS.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  const slugOf = (p) => p.split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  /** File bai rieng cua trang (khop tu khoa nguyen cum trong ten file), chua co thi null */
  function pageSong(page) {
    const key = PAGE_SONG[page];
    if (!key) return null;
    return SONGS.find((s) => ('-' + slugOf(s) + '-').includes('-' + key + '-')) || null;
  }
  /** Danh sach phat cho trang: bai rieng (hoac fallbackFirst neu co) truoc, cac bai con lai tron ngau nhien */
  function forPage(page, fallbackFirst) {
    const first = pageSong(page) || (fallbackFirst && SONGS.includes(fallbackFirst) ? fallbackFirst : null);
    const rest = shuffled();
    return first ? [first, ...rest.filter((s) => s !== first)] : rest;
  }

  return { SONGS, PAGE_SONG, shuffled, pageSong, forPage };
}));
