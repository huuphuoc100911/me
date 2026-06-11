// Head-to-head 2 đội
// Phương án: lấy team match history từ Football-Data (mỗi đội ~50 trận finished gần nhất),
// rồi filter các trận có 2 đội là đối thủ → tránh giới hạn /head2head endpoint.

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const teamsCache = { ts: 0, data: null };

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
  "dr congo": ["congo dr", "democratic republic of the congo", "dr congo"],
  "new zealand": ["new zealand"],
  "saudi arabia": ["saudi arabia"]
};
function aliases(name) {
  const lc = (name || "").toLowerCase().trim();
  return NAME_ALIASES[lc] || [lc];
}
function matchesName(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (x === y) return true;
  return aliases(y).includes(x) || aliases(x).includes(y);
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

async function getTeams(headers) {
  const now = Date.now();
  if (teamsCache.data && now - teamsCache.ts < 7 * TTL_MS) return teamsCache.data;
  const r = await safeFetch("https://api.football-data.org/v4/competitions/WC/teams", { headers });
  if (!r.ok) return null;
  teamsCache.ts = now;
  teamsCache.data = (r.data?.teams || []).map((t) => ({ id: t.id, name: t.name, shortName: t.shortName, tla: t.tla }));
  return teamsCache.data;
}

function findTeamId(teams, name) {
  for (const t of teams) {
    if (matchesName(t.name, name) || matchesName(t.shortName, name)) return t.id;
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");

  const { home, away } = req.query || {};
  if (!(home && away)) {
    return res.status(200).json({ matches: [], stats: { homeWins: 0, awayWins: 0, draws: 0 }, note: "Cần home + away" });
  }
  const cacheKey = `${home}|${away}`;

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.data);
  }

  const reply = (data) => {
    cache.set(cacheKey, { ts: now, data });
    return res.status(200).json(data);
  };
  const empty = (note) => reply({ matches: [], stats: { homeWins: 0, awayWins: 0, draws: 0 }, note });

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return empty("Chưa cấu hình FOOTBALL_DATA_API_KEY trên Vercel");
  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };

  // 1. Lấy danh sách 48 đội WC để tìm team id
  const teams = await getTeams(headers);
  if (!teams || !teams.length) return empty("Không lấy được danh sách đội từ FD");

  const homeId = findTeamId(teams, home);
  const awayId = findTeamId(teams, away);
  if (!homeId) return empty(`Không tìm thấy ID đội ${home} trên FD`);
  if (!awayId) return empty(`Không tìm thấy ID đội ${away} trên FD`);

  // 2. Fetch match history của đội home (giới hạn 50 trận finished gần nhất)
  const hr = await safeFetch(
    `https://api.football-data.org/v4/teams/${homeId}/matches?status=FINISHED&limit=50`,
    { headers }
  );
  if (!hr.ok) return empty(`Không gọi được team matches (${hr.status || hr.error})`);

  // 3. Filter các trận có đối thủ là away
  const all = hr.data?.matches || [];
  const h2h = all.filter((m) => {
    const h = m.homeTeam?.name, a = m.awayTeam?.name;
    return (matchesName(h, home) && matchesName(a, away)) ||
           (matchesName(h, away) && matchesName(a, home));
  }).sort((a, b) => new Date(b.utcDate) - new Date(a.utcDate));

  if (!h2h.length) {
    return empty(`Football-Data không có lịch sử đối đầu ${home} vs ${away} (free tier chỉ track 1 số giải)`);
  }

  // 4. Tính stats
  let homeWins = 0, awayWins = 0, draws = 0;
  for (const p of h2h) {
    const sh = p.score?.fullTime?.home;
    const sa = p.score?.fullTime?.away;
    if (sh == null || sa == null) continue;
    if (sh === sa) { draws++; continue; }
    const winnerName = sh > sa ? p.homeTeam?.name : p.awayTeam?.name;
    if (matchesName(winnerName, home)) homeWins++;
    else if (matchesName(winnerName, away)) awayWins++;
  }

  res.setHeader("X-Cache", "MISS");
  return reply({
    matches: h2h.slice(0, 10),
    stats: { homeWins, awayWins, draws },
    source: "football-data"
  });
};
