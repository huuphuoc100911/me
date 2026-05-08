// Giá xăng dầu — scrape từ Saigon Petro (homepage có sẵn block giá)
// Cập nhật theo kỳ điều hành (~7 ngày/lần) → cache 1 giờ.

const SRC_URL = "https://www.saigonpetro.com.vn";
const TTL_MS = 60 * 60 * 1000;

let cache = { ts: 0, data: null };

function parsePrices(html) {
  const items = [];
  const re = /<a\s+class="item"\s+href="\/ban-le-xang-dau"[^>]*>\s*<span>([^<]+)<\/span>\s*<span>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[1].trim();
    const priceStr = m[2].replace(/[^\d]/g, "");
    if (!priceStr) continue;
    items.push({ name, price: Number(priceStr), unit: "đ/lít" });
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=600");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, items: cache.data });
  }

  try {
    const r = await fetch(SRC_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DashboardVN/1.0)" }
    });
    if (!r.ok) return res.status(502).json({ error: "Saigon Petro fail" });
    const html = await r.text();
    const items = parsePrices(html);
    if (items.length === 0) {
      return res.status(502).json({ error: "Không parse được giá" });
    }
    cache = { ts: now, data: items };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, items, source: "Saigon Petro" });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
