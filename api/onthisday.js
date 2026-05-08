// Ngày này năm xưa — scrape Wikipedia VI page "<dd> tháng <mm>"
// Cache theo ngày (đến nửa đêm).

let cache = { dayKey: "", data: null };

function stripTags(s) {
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEvents(html) {
  const i = html.indexOf("Sự kiện</h2>");
  if (i < 0) return [];
  // Lấy đến section kế tiếp (Sinh / Mất / Ngày lễ)
  const tail = html.slice(i);
  const stop = tail.search(/<h2[^>]*>/);
  const block = stop > 0 ? tail.slice(0, stop) : tail;

  const items = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = liRe.exec(block)) !== null) {
    const text = stripTags(m[1]);
    if (!text) continue;
    // Tách năm – nội dung
    const ym = text.match(/^(\d{1,4})\s*[–\-]\s*(.+)$/);
    if (ym) {
      items.push({ year: Number(ym[1]), text: ym[2] });
    } else {
      items.push({ year: null, text });
    }
  }
  return items;
}

function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");

  const now = new Date();
  // Theo giờ VN (UTC+7)
  const vnNow = new Date(now.getTime() + 7 * 3600 * 1000);
  const dd = vnNow.getUTCDate();
  const mm = vnNow.getUTCMonth() + 1;
  const dayKey = `${mm}-${dd}`;

  if (cache.dayKey === dayKey && cache.data) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ day: dayKey, items: cache.data });
  }

  try {
    const slug = encodeURIComponent(`${dd} tháng ${mm}`);
    const r = await fetch(
      `https://vi.wikipedia.org/api/rest_v1/page/html/${slug}`,
      { headers: { "User-Agent": "DashboardVN/1.0 (personal use)" } }
    );
    if (!r.ok) return res.status(502).json({ error: "Wiki HTTP " + r.status });
    const html = await r.text();
    const all = parseEvents(html).filter((e) => e.year && e.text.length < 220);
    if (all.length === 0) return res.status(502).json({ error: "Không parse được" });

    // Ưu tiên VN nếu có, lấy 6 mục
    const vnItems = all.filter((e) => /Việt Nam|Hà Nội|Sài Gòn|Huế|Đà Nẵng/i.test(e.text));
    const others = all.filter((e) => !vnItems.includes(e));
    const items = [...pickRandom(vnItems, 3), ...pickRandom(others, 3)].slice(0, 6)
      .sort((a, b) => b.year - a.year);

    cache = { dayKey, data: items };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ day: dayKey, items });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
