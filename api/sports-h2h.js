// Head-to-head 2 đội (lịch sử đối đầu thật)
// Nguồn: Football-Data.org /v4/matches/{id}/head2head (cần API key, free tier)

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

// Đồng nghĩa tên đội giữa openfootball và Football-Data
const NAME_ALIASES = {
  "south korea": ["korea republic", "south korea", "republic of korea"],
  "czech republic": ["czechia", "czech republic"],
  "czechia": ["czechia", "czech republic"],
  "usa": ["united states", "usa"],
  "united states": ["united states", "usa"],
  "bosnia & herzegovina": ["bosnia-herzegovina", "bosnia and herzegovina", "bosnia & herzegovina"],
  "ivory coast": ["côte d'ivoire", "ivory coast", "cote d'ivoire"],
  "turkey": ["türkiye", "turkey", "turkiye"],
  "cape verde": ["cabo verde", "cape verde"],
  "dr congo": ["congo dr", "democratic republic of the congo", "dr congo"]
};
function aliases(name) {
  const lc = (name || "").toLowerCase().trim();
  return NAME_ALIASES[lc] || [lc];
}
function matchesName(fdName, ourName) {
  if (!fdName || !ourName) return false;
  const a = (fdName || "").toLowerCase().trim();
  const b = (ourName || "").toLowerCase().trim();
  if (a === b) return true;
  return aliases(b).some((x) => x === a) || aliases(a).some((x) => x === b);
}

async function safeFetch(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");

  const { matchId, home, away } = req.query || {};
  if (!(home && away)) {
    return res.status(200).json({ matches: [], stats: { homeWins: 0, awayWins: 0, draws: 0 }, note: "Cần home + away" });
  }
  const cacheKey = matchId || `${home}|${away}`;

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.data);
  }

  const empty = (note) => {
    const data = { matches: [], stats: { homeWins: 0, awayWins: 0, draws: 0 }, note };
    cache.set(cacheKey, { ts: now, data });
    return res.status(200).json(data);
  };

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return empty("Chưa cấu hình FOOTBALL_DATA_API_KEY");

  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };

  // 1. Lấy danh sách matches WC
  const mr = await safeFetch("https://api.football-data.org/v4/competitions/WC/matches", { headers });
  if (!mr.ok) {
    console.warn("[h2h] FD matches fail", mr);
    return empty(`Không gọi được FD matches (${mr.status || mr.error || "?"})`);
  }
  const matches = mr.data?.matches || [];

  // 2. Tìm match khớp home+away
  let fdMatch = null;
  for (const m of matches) {
    const h = m.homeTeam?.name;
    const a = m.awayTeam?.name;
    if ((matchesName(h, home) && matchesName(a, away)) ||
        (matchesName(h, away) && matchesName(a, home))) {
      fdMatch = m; break;
    }
  }
  if (!fdMatch) return empty(`Không tìm thấy trận ${home} vs ${away} trên FD`);

  // 3. Gọi head2head endpoint
  const hr = await safeFetch(`https://api.football-data.org/v4/matches/${fdMatch.id}/head2head?limit=10`, { headers });
  if (!hr.ok) {
    console.warn("[h2h] FD h2h fail", hr);
    return empty(`Không gọi được FD h2h (${hr.status || hr.error || "?"})`);
  }
  const h2hMatches = hr.data?.matches || [];

  // 4. Tính stats
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const p of h2hMatches) {
    const ph = p.homeTeam?.name;
    const pa = p.awayTeam?.name;
    const sh = p.score?.fullTime?.home;
    const sa = p.score?.fullTime?.away;
    if (sh == null || sa == null) continue;
    if (sh === sa) { draws++; continue; }
    const winnerIsP1 = sh > sa;
    const winnerName = winnerIsP1 ? ph : pa;
    if (matchesName(winnerName, home)) homeWins++;
    else if (matchesName(winnerName, away)) awayWins++;
  }

  const data = {
    matches: h2hMatches,
    stats: { homeWins, awayWins, draws },
    source: "football-data"
  };
  cache.set(cacheKey, { ts: now, data });
  res.setHeader("X-Cache", "MISS");
  return res.status(200).json(data);
};
