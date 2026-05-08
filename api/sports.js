// Lịch FIFA World Cup 2026 — đủ 104 trận
// Nguồn chính: openfootball/world-cup.json (GitHub, no key)
// Bổ sung badge cờ đội: TheSportsDB free (chỉ có ~15 trận đầu)

const OPENFB_URL = "https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/worldcup.json";
const SDB_URL = "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";
const TTL_MS = 6 * 60 * 60 * 1000;

let cache = { ts: 0, data: null };

// "13:00 UTC-6" + "2026-06-11" → epoch ms
function parseKickoff(date, time) {
  if (!date) return null;
  if (!time) {
    // không có giờ → 12:00 UTC mặc định
    return Date.parse(date + "T12:00:00Z");
  }
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(?:UTC([+-]\d+))?/);
  if (!m) return Date.parse(date + "T12:00:00Z");
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  const off = m[3] ? Number(m[3]) : 0; // UTC-6 → -6
  const utcH = hh - off; // local → UTC
  const [yy, mm, dd] = date.split("-").map(Number);
  return Date.UTC(yy, mm - 1, dd, utcH, mi);
}

async function fetchOpenFb() {
  const r = await fetch(OPENFB_URL, { headers: { "User-Agent": "DashboardVN/1.0" } });
  if (!r.ok) throw new Error("openfootball HTTP " + r.status);
  return r.json();
}

async function fetchBadges() {
  try {
    const r = await fetch(SDB_URL, { headers: { "User-Agent": "DashboardVN/1.0" } });
    if (!r.ok) return {};
    const j = await r.json();
    const map = {};
    for (const e of (j.events || [])) {
      if (e.strHomeTeam && e.strHomeTeamBadge) map[e.strHomeTeam.toLowerCase()] = e.strHomeTeamBadge;
      if (e.strAwayTeam && e.strAwayTeamBadge) map[e.strAwayTeam.toLowerCase()] = e.strAwayTeamBadge;
    }
    return map;
  } catch {
    return {};
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, ...cache.data });
  }

  try {
    const [json, badges] = await Promise.all([fetchOpenFb(), fetchBadges()]);
    const all = (json.matches || []).map((m) => {
      const ts = parseKickoff(m.date, m.time);
      return {
        ts,
        date: m.date,
        round: m.round,
        group: m.group || null,
        venue: m.ground || null,
        home: m.team1,
        away: m.team2,
        homeBadge: badges[(m.team1 || "").toLowerCase()] || null,
        awayBadge: badges[(m.team2 || "").toLowerCase()] || null,
        homeScore: m.score1 != null ? m.score1 : null,
        awayScore: m.score2 != null ? m.score2 : null
      };
    });

    all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const nowMs = Date.now();
    const upcoming = all.filter((x) => !x.ts || x.ts >= nowMs - 3 * 3600 * 1000);

    const data = {
      league: json.name || "FIFA World Cup 2026",
      total: all.length,
      upcomingCount: upcoming.length,
      // Trả tất cả để client tự cắt / tìm theo nhu cầu
      matches: all
    };
    cache = { ts: now, data };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, ...data });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
