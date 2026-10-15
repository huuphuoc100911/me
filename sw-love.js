/**
 * Service worker cho love.personal.io.vn — xem lai duoc khi mang yeu / mat mang (toi 18/10 wifi chap chon).
 * Dang ky tu js/offline.js (co tren 10 trang love).
 *
 *  - Trang HTML, js, json:  LAY MANG TRUOC (co mang la luon moi, khong phai doi phien ban),
 *                           mat mang thi lay ban da luu.
 *  - Anh (thumbs/nho/md/goc), sticker, truyen tranh webp, font Google, icon:
 *                           LAY CACHE TRUOC, chua co thi tai roi luu — lan sau mo tuc thi.
 *  - mp4 / mp3, /api/, do-in/, file in (png/pdf/zip): KHONG dong vao. Video/nhac tai theo tung doan
 *                           (Range), tra ban cache nguyen khoi la Safari khong phat duoc.
 *
 * Doi ten CACHE khi THAY FILE CUNG TEN (vd nen lai nhac, lam lai anh thu nho) de xoa cache cu.
 */
const CACHE = 'love-v1';
const SHELL = [
  '/love.html', '/365-vi-sao.html', '/trai-tim-khoanh-khac.html', '/mot-nam-nhin-lai.html', '/la-thu-niem-phong.html',
  '/rap-phim.html', '/chuyen-cua-chung-minh.html', '/truyen-tranh.html', '/phieu-yeu-thuong.html', '/qua-nho.html',
  '/js/lunar.js', '/js/milestones.js', '/js/letters.js', '/js/love-music.js', '/js/chibi.js', '/js/chan-zoom.js', '/js/offline.js',
  '/images/love/images.json', '/data/letters.json', '/sticker/sticker.json', '/truyen-tranh/trang.json', '/manifest-love.json',
];
const FRESH = /\.(html|js|json)$/i;                                // lay mang truoc
const STORE = /\.(webp|jpe?g|png|gif|svg|woff2?|ttf|otf|css)$/i;   // lay cache truoc
const SKIP = /\.(mp4|mp3|m4a|webm|mov|zip|pdf)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith('love-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const font = /^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!own && !font) return;
  if (own && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/do-in/') || SKIP.test(url.pathname)
    || /^\/truyen-tranh\/.*\.png$/i.test(url.pathname))) return;
  if (req.mode === 'navigate' || (own && FRESH.test(url.pathname))) { e.respondWith(networkFirst(req)); return; }
  if (font || STORE.test(url.pathname)) e.respondWith(cacheFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') { const home = await c.match('/love.html'); if (home) return home; }
    return Response.error();
  }
}

async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') c.put(req, r.clone());
  return r;
}
