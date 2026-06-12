// Diễn biến chi tiết 1 trận từ Football-Data.org /v4/matches/{id}
// Trả về goals, bookings (thẻ vàng/đỏ), substitutions theo phút.

const TTL_MS = 5 * 60 * 1000; // 5 phút (đỡ khi live)
const cache = new Map();

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
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");

  const { id } = req.query || {};
  if (!id) return res.status(200).json({ events: [], note: "Cần param id (FD match id)" });

  const now = Date.now();
  const cached = cache.get(id);
  if (cached && now - cached.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json(cached.data);
  }

  const reply = (data) => {
    cache.set(id, { ts: now, data });
    return res.status(200).json(data);
  };

  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) return reply({ events: [], note: "Chưa cấu hình FOOTBALL_DATA_API_KEY" });

  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };
  const r = await safeFetch(`https://api.football-data.org/v4/matches/${encodeURIComponent(id)}`, { headers });
  if (!r.ok) return reply({ events: [], note: `FD match fetch fail (${r.status || r.error})` });

  const m = r.data || {};
  const events = [];

  // Goals
  for (const g of (m.goals || [])) {
    events.push({
      type: "goal",
      minute: g.minute,
      added: g.injuryTime || null,
      team: g.team?.name,
      teamSide: g.team?.id === m.homeTeam?.id ? "home" : "away",
      player: g.scorer?.name,
      assist: g.assist?.name || null,
      score: g.score ? `${g.score.home}-${g.score.away}` : null,
      kind: g.type || "REGULAR"  // REGULAR, OWN, PENALTY, etc.
    });
  }
  // Bookings (cards)
  for (const b of (m.bookings || [])) {
    events.push({
      type: b.card === "RED_CARD" ? "red" : b.card === "YELLOW_RED_CARD" ? "yellowred" : "yellow",
      minute: b.minute,
      team: b.team?.name,
      teamSide: b.team?.id === m.homeTeam?.id ? "home" : "away",
      player: b.player?.name
    });
  }
  // Substitutions
  for (const s of (m.substitutions || [])) {
    events.push({
      type: "sub",
      minute: s.minute,
      team: s.team?.name,
      teamSide: s.team?.id === m.homeTeam?.id ? "home" : "away",
      playerIn: s.playerIn?.name,
      playerOut: s.playerOut?.name
    });
  }
  // Sắp xếp theo phút
  events.sort((a, b) => (a.minute || 0) - (b.minute || 0) || (a.added || 0) - (b.added || 0));

  return reply({
    matchId: m.id,
    status: m.status,
    minute: m.minute || null,
    home: m.homeTeam?.name,
    away: m.awayTeam?.name,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    referees: (m.referees || []).map((r) => ({ name: r.name, role: r.role, nationality: r.nationality })),
    events,
    source: "football-data"
  });
};
