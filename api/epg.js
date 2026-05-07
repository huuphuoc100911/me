// EPG (Electronic Program Guide) cho 11 kênh VTV.
// Source: https://vtv.vn/lich-phat-song.htm — server-rendered HTML, không cần auth.
// Cache 30 phút trong memory + Cache-Control để Vercel CDN cache thêm 1 lớp.

const SOURCE_URL = "https://vtv.vn/lich-phat-song.htm";
const TTL_MS = 30 * 60 * 1000;

// Thứ tự 11 channel block trên vtv.vn (cố định, đã verify bằng cách parse HTML).
const CHANNEL_ORDER = [
  "vtv1", "vtv2", "vtv3", "vtv4",
  "vtv5", "vtv5-tnb", "vtv5-tn",
  "vtv7", "vtv8", "vtv9", "vtv-cantho"
];

let cache = { ts: 0, data: null };

function decodeHtml(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function parseEpg(html) {
  const result = {};
  const blockRegex = /<ul[^>]*class="programs"[^>]*>([\s\S]*?)<\/ul>/g;
  let i = 0;
  let m;
  while ((m = blockRegex.exec(html)) !== null) {
    const key = CHANNEL_ORDER[i++];
    if (!key) break;
    const itemRegex = /<li[^>]*duration="(\d+)"[^>]*class="program"[^>]*>\s*<span class="time">([^<]+)<\/span>\s*<span class="title">([^<]*)<\/span>(?:\s*<a class="genre">([^<]*)<\/a>)?\s*<\/li>/g;
    const items = [];
    let it;
    while ((it = itemRegex.exec(m[1])) !== null) {
      items.push({
        time: it[2].trim(),
        title: decodeHtml(it[3]).trim(),
        genre: decodeHtml(it[4] || "").trim(),
        duration: parseInt(it[1], 10) || 0
      });
    }
    result[key] = items;
  }
  return result;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=600");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, channels: cache.data });
  }

  try {
    const r = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VTVOnlineLocal/1.0)",
        "Accept": "text/html"
      }
    });
    if (!r.ok) {
      return res.status(502).json({ error: `vtv.vn returned ${r.status}` });
    }
    const html = await r.text();
    const channels = parseEpg(html);
    if (Object.keys(channels).length === 0) {
      return res.status(502).json({ error: "parse failed - HTML structure changed?" });
    }
    cache = { ts: now, data: channels };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: cache.ts, channels });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
