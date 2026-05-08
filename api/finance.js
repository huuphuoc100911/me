// Tỷ giá ngoại tệ (Vietcombank XML) + Giá vàng (PNJ JSON API).
// Cache 5 phút (Vietcombank cảnh báo "1 request mỗi 5 phút").

const VCB_URL = "https://portal.vietcombank.com.vn/Usercontrols/TVPortal.TyGia/pXML.aspx";
const PNJ_URL = "https://edge-api.pnj.io/ecom-frontend/v1/get-gold-price";

const TTL_MS = 5 * 60 * 1000;
const SHOW_CURRENCIES = ["USD", "EUR", "JPY", "CNY", "AUD", "GBP", "KRW"];

let cache = { ts: 0, data: null };

function parseVcbXml(xml) {
  const out = {};
  const dtMatch = xml.match(/<DateTime>([^<]+)<\/DateTime>/);
  out._datetime = dtMatch ? dtMatch[1].trim() : "";

  const re = /<Exrate\s+CurrencyCode="([^"]+)"\s+CurrencyName="([^"]*)"\s+Buy="([^"]*)"\s+Transfer="([^"]*)"\s+Sell="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const code = m[1].trim();
    if (!SHOW_CURRENCIES.includes(code)) continue;
    out[code] = {
      name: m[2].trim(),
      buy: m[3].replace(/,/g, "").trim(),
      transfer: m[4].replace(/,/g, "").trim(),
      sell: m[5].replace(/,/g, "").trim()
    };
  }
  return out;
}

async function fetchVcb() {
  try {
    const r = await fetch(VCB_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DashboardVN/1.0)" }
    });
    if (!r.ok) return null;
    const xml = await r.text();
    return parseVcbXml(xml);
  } catch (e) {
    console.warn("[finance] vcb fail:", e.message);
    return null;
  }
}

async function fetchGold() {
  try {
    const r = await fetch(PNJ_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DashboardVN/1.0)" }
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.data) return null;
    // Trả về top 5 sản phẩm phổ biến nhất
    const wanted = ["SJC", "N24K", "KB", "TL", "PNJ"];
    return j.data
      .filter((g) => wanted.includes(g.masp))
      .map((g) => ({
        code: g.masp,
        name: g.tensp,
        buy: g.giamua,
        sell: g.giaban,
        unit: "VND/chỉ (×1000)"
      }));
  } catch (e) {
    console.warn("[finance] gold fail:", e.message);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=120");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, ...cache.data });
  }

  const [exchange, gold] = await Promise.all([fetchVcb(), fetchGold()]);
  if (!exchange && !gold) {
    return res.status(502).json({ error: "Cả 2 nguồn đều fail" });
  }
  const data = { exchange, gold };
  cache = { ts: now, data };
  res.setHeader("X-Cache", "MISS");
  return res.status(200).json({ updated: now, ...data });
};
