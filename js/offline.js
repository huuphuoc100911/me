/**
 * Dang ky service worker (sw-love.js) de cac trang love xem lai duoc khi mang yeu / mat mang.
 * Chi dang ky tren love.personal.io.vn (va 127.0.0.1 luc thu may): tren may chu chung
 * personal.io.vn thi khong, keo no om luon cac trang khac cua site.
 */
if ('serviceWorker' in navigator && (location.hostname === 'love.personal.io.vn' || location.hostname === '127.0.0.1')) {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw-love.js').catch(() => {}); });
}
