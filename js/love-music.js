/**
 * Danh sach nhac nen dung chung cho love.html va 4 trang qua.
 * Moi lan mo trang thu tu bai duoc tron ngau nhien -> trang nao, lan nao cung
 * co the mo dau bang mot bai khac. Them / xoa bai: tha mp3 vao music/love roi
 * chay `npm run music` (tools/music.js tu viet lai SONGS theo thu muc).
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

  /** Ban sao cua SONGS da tron ngau nhien (Fisher-Yates) */
  function shuffled() {
    const list = SONGS.slice();
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  return { SONGS, shuffled };
}));
