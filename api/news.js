// Aggregate top headlines từ 3 nguồn báo Việt Nam (RSS).
// Cache 10 phút trong memory + Cache-Control để Vercel CDN cache thêm 1 lớp.

const SOURCES = [
  { name: "VnExpress", url: "https://vnexpress.net/rss/tin-moi-nhat.rss" },
  { name: "Tuổi Trẻ",   url: "https://tuoitre.vn/rss/tin-moi-nhat.rss" },
  { name: "Dân Trí",    url: "https://dantri.com.vn/trangchu.rss" }
];

const TTL_MS = 10 * 60 * 1000;
const PER_SOURCE = 6;
const TOTAL_LIMIT = 15;

let cache = { ts: 0, data: null };

function decodeHtml(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .trim();
}

function extractTag(item, tag) {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeHtml(m[1]) : "";
}

function parseRss(xml, sourceName) {
  const items = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const it = m[1];
    const title = extractTag(it, "title");
    const link = extractTag(it, "link");
    const pubDate = extractTag(it, "pubDate");
    if (!title || !link) continue;
    // Lấy ảnh đầu tiên từ <description> nếu có
    const desc = extractTag(it, "description");
    const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
    items.push({
      source: sourceName,
      title,
      link,
      pubDate,
      ts: pubDate ? new Date(pubDate).getTime() : 0,
      image: imgMatch ? imgMatch[1] : null
    });
    if (items.length >= PER_SOURCE) break;
  }
  return items;
}

async function fetchSource(s) {
  try {
    const r = await fetch(s.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DashboardVN/1.0)",
        "Accept": "application/rss+xml, application/xml, text/xml"
      }
    });
    if (!r.ok) return [];
    const xml = await r.text();
    return parseRss(xml, s.name);
  } catch (e) {
    console.warn("[news] fetch fail:", s.name, e.message);
    return [];
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=300");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, items: cache.data });
  }

  try {
    const all = (await Promise.all(SOURCES.map(fetchSource))).flat();
    if (all.length === 0) {
      return res.status(502).json({ error: "Tất cả nguồn RSS đều fail" });
    }
    // Sort theo pubDate giảm dần, dedupe theo title (loại bài trùng)
    const seen = new Set();
    const items = all
      .sort((a, b) => b.ts - a.ts)
      .filter((it) => {
        const key = it.title.toLowerCase().slice(0, 60);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, TOTAL_LIMIT);

    cache = { ts: now, data: items };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, items });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
