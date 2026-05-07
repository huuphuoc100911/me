// Service Worker — cache app shell (HTML/CSS/JS) cho install + offline,
// KHÔNG cache HLS streams (live data luôn cần fresh).

const CACHE_NAME = "vtv-online-v2";

// Files cần cache trước khi SW activate (app shell tối thiểu để mở offline)
const APP_SHELL = [
  "/",
  "/vtv-online.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/hls.js@1.5.13"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((e) => console.warn("[SW] cache fail:", url, e.message))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategy:
// - HLS streams (.m3u8, .ts) + EPG API → network only (data luôn fresh)
// - App shell (HTML/CSS/JS/icons) → cache-first, fallback network
// - Other cross-origin → network, cache nếu thành công
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bỏ qua live stream — không cache, không intercept
  const isStreamHost =
    url.hostname.includes("fptplay") ||
    url.hostname.includes("vtvprime") ||
    url.hostname.includes("vtvdigital") ||
    url.hostname.includes("canthotv") ||
    url.pathname.endsWith(".m3u8") ||
    url.pathname.endsWith(".ts");
  if (isStreamHost) return; // pass-through

  // EPG API → network only (data live)
  if (url.pathname.startsWith("/api/")) return;

  // GET only — không cache POST/PUT
  if (req.method !== "GET") return;

  // Cache-first cho app shell + cross-origin assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && res.status < 400) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached); // offline fallback
    })
  );
});
