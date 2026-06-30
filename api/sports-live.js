// Tỉ số live siêu nhanh từ ESPN (undocumented public API)
// Endpoint không cần key, không rate limit công khai → cập nhật tỉ số ~10s sau bàn thắng.
// Dùng làm nguồn phụ cho live bar, ghép với fixture data từ Football-Data.org.

const ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const TTL_MS = 15 * 1000; // 15s — ESPN không advertise rate limit nhưng đỡ vẫn tốt
let cache = { ts: 0, data: null };

// Map tên ESPN ↔ tên Football-Data để client ghép được
const NAME_MAP = {
  "Korea Republic": "South Korea",
  "Czechia": "Czechia",
  "USA": "United States",
  "United States": "United States",
  "Iran": "Iran",
  "Cote d'Ivoire": "Ivory Coast",
  "Türkiye": "Turkey",
  "Cabo Verde": "Cape Verde",
  "Bosnia and Herzegovina": "Bosnia & Herzegovina",
  "DR Congo": "DR Congo"
};
const norm = (n) => NAME_MAP[n] || n;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=15, max-age=0");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, ...cache.data });
  }

  try {
    const r = await fetch(ESPN_URL, { headers: { "User-Agent": "DashboardVN/1.0" } });
    if (!r.ok) throw new Error("ESPN HTTP " + r.status);
    const j = await r.json();
    const events = j.events || [];

    const matches = events.map((e) => {
      const comp = (e.competitions && e.competitions[0]) || {};
      const competitors = comp.competitors || [];
      const homeC = competitors.find((c) => c.homeAway === "home") || competitors[0] || {};
      const awayC = competitors.find((c) => c.homeAway === "away") || competitors[1] || {};
      const status = e.status || {};
      const stateRaw = status.type?.state || "pre";
      const stateName = status.type?.name || "";
      // pre = sắp đá, in = đang đá, post = đã kết thúc
      const state =
        stateRaw === "in" ? "LIVE" :
        stateRaw === "post" ? "FINISHED" :
        "SCHEDULED";
      const home = norm(homeC.team?.displayName);
      const away = norm(awayC.team?.displayName);
      // shootoutScore = loạt luân lưu (chỉ có ở trận hoà sau 120'); score = tỉ số 120'
      const pen = (c) => {
        const v = c.shootoutScore;
        return (v === undefined || v === null || v === "") ? null : (parseInt(v, 10) || 0);
      };
      return {
        espnId: e.id,
        ts: e.date ? Date.parse(e.date) : null,
        home, away,
        homeScore: state === "SCHEDULED" ? null : (parseInt(homeC.score, 10) || 0),
        awayScore: state === "SCHEDULED" ? null : (parseInt(awayC.score, 10) || 0),
        homePen: state === "SCHEDULED" ? null : pen(homeC),
        awayPen: state === "SCHEDULED" ? null : pen(awayC),
        clock: status.displayClock || null, // "82'" hoặc "90'+8'"
        period: status.period || 0,
        state,
        statusDetail: stateName // STATUS_SECOND_HALF, STATUS_FULL_TIME, STATUS_HALFTIME
      };
    });

    const live = matches.filter((m) => m.state === "LIVE");
    const data = {
      total: matches.length,
      live: live.length,
      matches,
      source: "espn"
    };
    cache = { ts: now, data };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, ...data });
  } catch (err) {
    return res.status(200).json({
      matches: [],
      error: String(err.message || err),
      source: "espn-failed"
    });
  }
};
