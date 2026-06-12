// Squad (danh sách cầu thủ) của 1 đội tuyển WC 2026
// Nguồn: Football-Data.org /v4/teams/{id} (cần API key)

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const teamsCache = { ts: 0, data: null };

const NAME_ALIASES = {
  "south korea": ["korea republic", "south korea"],
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
function matchesName(a, b) {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim(), y = b.toLowerCase().trim();
  if (x === y) return true;
  return (NAME_ALIASES[x] || []).includes(y) || (NAME_ALIASES[y] || []).includes(x);
}

async function safeFetch(url, opts) {
  try {
    const r = await fetch(url, opts);
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: await r.json() };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}

async function getTeams(headers) {
  const now = Date.now();
  if (teamsCache.data && now - teamsCache.ts < 7 * TTL_MS) return teamsCache.data;
  const r = await safeFetch("https://api.football-data.org/v4/competitions/WC/teams", { headers });
  if (!r.ok) return null;
  teamsCache.ts = now;
  teamsCache.data = r.data?.teams || [];
  return teamsCache.data;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");

  const { team } = req.query || {};
  if (!team) return res.status(200).json({ squad: [], note: "Cần param team" });

  const now = Date.now();
  const cached = cache.get(team);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.data);
  }

  const reply = (data) => {
    cache.set(team, { ts: now, data });
    return res.status(200).json(data);
  };

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return reply({ squad: [], note: "Chưa cấu hình FOOTBALL_DATA_API_KEY" });

  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };
  const teams = await getTeams(headers);
  if (!teams) return reply({ squad: [], note: "Không lấy được danh sách đội" });

  const found = teams.find((t) => matchesName(t.name, team) || matchesName(t.shortName, team));
  if (!found) return reply({ squad: [], note: `Không tìm thấy đội ${team}` });

  const tr = await safeFetch(`https://api.football-data.org/v4/teams/${found.id}`, { headers });
  if (!tr.ok) return reply({ squad: [], note: `FD team detail fail (${tr.status})` });

  const squad = (tr.data?.squad || []).map((p) => ({
    name: p.name,
    position: p.position,
    dateOfBirth: p.dateOfBirth,
    nationality: p.nationality,
    shirtNumber: p.shirtNumber
  }));
  const coach = tr.data?.coach ? {
    name: tr.data.coach.name,
    nationality: tr.data.coach.nationality
  } : null;

  return reply({
    team: found.name,
    crest: tr.data?.crest,
    founded: tr.data?.founded,
    venue: tr.data?.venue,
    coach,
    squad,
    source: "football-data"
  });
};
