/**
 * Chan phong to trang tren dien thoai (dung chung cho love.html va 9 trang qua).
 *
 * - Android / Chrome: nghe `maximum-scale=1, user-scalable=no` trong the viewport (dat o tung trang).
 * - iPhone Safari bo qua user-scalable=no (tru khi mo tu man hinh chinh), nen chan them bang tay:
 *   `gesturestart` / `gesturechange` la su kien pinch rieng cua WebKit; `touchmove` co scale != 1 cung la pinch.
 *   Chi chan khi dang pinch, keo mot ngon van cuon binh thuong.
 * - Cham doi de phong to: `touch-action: manipulation` tren <html> (Safari 13+, Chrome deu hieu),
 *   khong lam mat cham nhanh lien tiep (trai tim 5 cham, do em, nut Tiep).
 */
(() => {
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('gesturechange', stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
  }, { passive: false });
  const apply = () => { document.documentElement.style.touchAction = 'manipulation'; };
  if (document.documentElement) apply(); else document.addEventListener('DOMContentLoaded', apply);
})();
