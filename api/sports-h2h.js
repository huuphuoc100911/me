// Head-to-head 2 đội (lịch sử đối đầu thật)
// Nguồn: Football-Data.org /v4/matches/{id}/head2head (cần API key)
// Cache 1 ngày per match.

const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // key = matchId

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");

  const { matchId, home, away } = req.query || {};
  if (!matchId && !(home && away)) {
    return res.status(400).json({ error: "Cần matchId hoặc home+away" });
  }
  const cacheKey = matchId || `${home}|${away}`;

  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.data);
  }

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) {
    return res.status(200).json({
      matches: [],
      stats: { homeWins: 0, awayWins: 0, draws: 0 },
      note: "Chưa cấu hình FOOTBALL_DATA_API_KEY"
    });
  }

  try {
    // Football-Data có endpoint /v4/matches/{id}/head2head — cần FD's match id
    // Mà ta dùng id custom; cần map tên đội → FD match id trước.
    // Cách hiệu quả: lấy danh sách WC matches từ FD, tìm match khớp home+away+ts, lấy FD id, rồi gọi h2h.
    const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };

    // Tìm FD match id
    const mr = await fetch("https://api.football-data.org/v4/competitions/WC/matches", { headers });
    if (!mr.ok) throw new Error("FD matches " + mr.status);
    const mj = await mr.json();
    let fdMatch = null;
    for (const m of (mj.matches || [])) {
      const h = m.homeTeam?.name || "";
      const a = m.awayTeam?.name || "";
      if ((h === home && a === away) || (h === away && a === home)) {
        fdMatch = m;
        break;
      }
    }
    if (!fdMatch) {
      const data = { matches: [], stats: { homeWins: 0, awayWins: 0, draws: 0 }, note: "Không tìm thấy trên FD" };
      cache.set(cacheKey, { ts: now, data });
      return res.status(200).json(data);
    }

    const hr = await fetch(`https://api.football-data.org/v4/matches/${fdMatch.id}/head2head?limit=10`, { headers });
    if (!hr.ok) throw new Error("FD h2h " + hr.status);
    const hj = await hr.json();

    // Tính stats từ matches[]
    let homeWins = 0, awayWins = 0, draws = 0;
    for (const p of (hj.matches || [])) {
      const ph = p.homeTeam?.name || "";
      const pa = p.awayTeam?.name || "";
      const sh = p.score?.fullTime?.home;
      const sa = p.score?.fullTime?.away;
      if (sh == null || sa == null) continue;
      const winner = sh > sa ? ph : sh < sa ? pa : null;
      if (winner === null) draws++;
      else if (winner === home) homeWins++;
      else if (winner === away) awayWins++;
    }

    const data = {
      matches: hj.matches || [],
      stats: { homeWins, awayWins, draws },
      source: "football-data"
    };
    cache.set(cacheKey, { ts: now, data });
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
