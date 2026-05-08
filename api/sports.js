// Lịch FIFA World Cup 2026 (TheSportsDB free, no key)
// League id 4429 = FIFA World Cup. Cache 6 giờ.

const WC_URL = "https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4429&s=2026";
const TTL_MS = 6 * 60 * 60 * 1000;

let cache = { ts: 0, data: null };

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, ...cache.data });
  }

  try {
    const r = await fetch(WC_URL, {
      headers: { "User-Agent": "DashboardVN/1.0" }
    });
    if (!r.ok) return res.status(502).json({ error: "TheSportsDB HTTP " + r.status });
    const j = await r.json();
    const all = (j.events || []).map((e) => ({
      id: e.idEvent,
      home: e.strHomeTeam,
      away: e.strAwayTeam,
      homeBadge: e.strHomeTeamBadge,
      awayBadge: e.strAwayTeamBadge,
      // Timestamp giờ địa phương sân; ta render dạng dd/mm + giờ
      ts: e.strTimestamp ? new Date(e.strTimestamp + "Z").getTime() : null,
      dateEvent: e.dateEvent,
      time: e.strTime ? e.strTime.slice(0, 5) : null,
      round: e.intRound ? Number(e.intRound) : null,
      venue: e.strVenue,
      country: e.strCountry,
      homeScore: e.intHomeScore != null ? Number(e.intHomeScore) : null,
      awayScore: e.intAwayScore != null ? Number(e.intAwayScore) : null,
      status: e.strStatus
    }));

    // Sort theo timestamp tăng dần. Ưu tiên trận chưa diễn ra.
    all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const nowMs = Date.now();
    const upcoming = all.filter((m) => !m.ts || m.ts >= nowMs - 3 * 3600 * 1000);
    const data = {
      league: "FIFA World Cup 2026",
      total: all.length,
      upcoming: upcoming.slice(0, 12)
    };
    cache = { ts: now, data };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, ...data });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
