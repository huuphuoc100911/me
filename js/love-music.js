/**
 * Danh sach nhac nen dung chung cho love.html va cac trang qua.
 *  - love.html: vao trang phat mot bai NGAU NHIEN trong ca danh sach.
 *  - Trang qua: phat BAI RIENG cua trang truoc (PAGE_SONG), het bai thi sang cac bai khac ngau nhien.
 *    Chua co file bai rieng thi phat ngau nhien nhu cu.
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

  // ★ Bai rieng cua tung trang: trang -> tu khoa co trong ten file (sau khi npm run music doi ten).
  //   Vd file "Chuyện Đôi Ta - Da LAB.mp3" thanh "chuyen-doi-ta-da-lab.mp3" -> khop 'chuyen-doi-ta'.
  const PAGE_SONG = {
    'chuyen-cua-chung-minh': 'chuyen-doi-ta',              // Chuyen Doi Ta - Da LAB, Muoii
    'truyen-tranh':          'co-em',                      // Co Em - Madihu, Low G
    'mot-nam-nhin-lai':      'khong-yeu-em-thi-yeu-ai',    // Khong Yeu Em Thi Yeu Ai? - Vu., Low G
    '365-vi-sao':            'tung-ngay-yeu-em',           // Tung Ngay Yeu Em - buitruonglinh
    'trai-tim-khoanh-khac':  'mot-nguoi-co-don',           // Va The Gioi Da Mat Di Mot Nguoi Co Don - marzuz, Changg
    'rap-phim':              'noi-nay-co-anh',             // Noi Nay Co Anh - Son Tung M-TP
    'la-thu-niem-phong':     'de-danh-cho-em',             // de danh cho em - Dangrangto, DONAL
    'phieu-yeu-thuong':      'da-lo-yeu-em-nhieu',         // Da Lo Yeu Em Nhieu - JustaTee
    'qua-nho':               'binh-yen',                   // Binh Yen - Vu., Binz
    'mon-qua-cuoi':          'mot-doi',                    // mot doi - 14 Casper, Bon Nghiem, buitruonglinh
  };

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
