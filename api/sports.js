// Lịch + BXH FIFA World Cup 2026
// - Mặc định: openfootball/world-cup.json (free, no key) — tỉ số trễ ~vài giờ
// - Nếu env FOOTBALL_DATA_API_KEY có giá trị → ưu tiên Football-Data.org (real-time)
//   Đăng ký key free: https://www.football-data.org/client/register

const OPENFB_URL = "https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/worldcup.json";
const FD_BASE = "https://api.football-data.org/v4/competitions/WC";
const TTL_MS = 10 * 60 * 1000; // 10 phút (đỡ live)

let cache = { ts: 0, data: null };

const FLAG_ISO = {
  "algeria":"dz","argentina":"ar","australia":"au","austria":"at","belgium":"be",
  "bosnia & herzegovina":"ba","bosnia and herzegovina":"ba","bosnia-herzegovina":"ba",
  "brazil":"br","canada":"ca","cape verde":"cv","cabo verde":"cv",
  "colombia":"co","croatia":"hr","curaçao":"cw","curacao":"cw","czech republic":"cz","czechia":"cz",
  "dr congo":"cd","democratic republic of the congo":"cd",
  "ecuador":"ec","egypt":"eg","england":"gb-eng","france":"fr","germany":"de",
  "ghana":"gh","haiti":"ht","iran":"ir","iraq":"iq","ivory coast":"ci","côte d'ivoire":"ci",
  "japan":"jp","jordan":"jo","mexico":"mx","morocco":"ma","netherlands":"nl","new zealand":"nz",
  "norway":"no","panama":"pa","paraguay":"py","portugal":"pt","qatar":"qa",
  "saudi arabia":"sa","scotland":"gb-sct","senegal":"sn","south africa":"za",
  "south korea":"kr","korea republic":"kr","spain":"es","sweden":"se","switzerland":"ch",
  "tunisia":"tn","turkey":"tr","türkiye":"tr","usa":"us","united states":"us",
  "uruguay":"uy","uzbekistan":"uz"
};
const flag = (n) => {
  if (!n) return null;
  const iso = FLAG_ISO[String(n).toLowerCase()];
  return iso ? `https://flagcdn.com/w40/${iso}.png` : null;
};

function parseKickoff(date, time) {
  if (!date) return null;
  if (!time) return Date.parse(date + "T12:00:00Z");
  const m = time.match(/^(\d{1,2}):(\d{2})\s*(?:UTC([+-]\d+))?/);
  if (!m) return Date.parse(date + "T12:00:00Z");
  const hh = Number(m[1]), mi = Number(m[2]), off = m[3] ? Number(m[3]) : 0;
  const [yy, mo, dd] = date.split("-").map(Number);
  return Date.UTC(yy, mo - 1, dd, hh - off, mi);
}

/* ===== Nguồn 1: openfootball ===== */
async function fromOpenFootball() {
  const r = await fetch(OPENFB_URL, { headers: { "User-Agent": "DashboardVN/1.0" } });
  if (!r.ok) throw new Error("openfootball HTTP " + r.status);
  const j = await r.json();
  const matches = (j.matches || []).map((m) => ({
    ts: parseKickoff(m.date, m.time),
    date: m.date,
    round: m.round || null,
    group: m.group || null,
    venue: m.ground || null,
    home: m.team1,
    away: m.team2,
    homeBadge: flag(m.team1),
    awayBadge: flag(m.team2),
    homeScore: m.score1 != null ? m.score1 : null,
    awayScore: m.score2 != null ? m.score2 : null,
    status: (m.score1 != null && m.score2 != null) ? "FINISHED" : "SCHEDULED"
  }));
  return { matches, source: "openfootball" };
}

/* ===== Nguồn 2: Football-Data.org (cần key) ===== */
async function fromFootballData(key) {
  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };
  const [mr, sr] = await Promise.all([
    fetch(FD_BASE + "/matches", { headers }),
    fetch(FD_BASE + "/standings", { headers })
  ]);
  if (!mr.ok) throw new Error("FD matches " + mr.status);
  const mj = await mr.json();
  const sj = sr.ok ? await sr.json() : { standings: [] };

  const matches = (mj.matches || []).map((m) => ({
    ts: m.utcDate ? Date.parse(m.utcDate) : null,
    date: m.utcDate ? m.utcDate.slice(0, 10) : null,
    round: m.matchday ? `Matchday ${m.matchday}` : (m.stage || null),
    group: m.group || null,
    venue: null,
    home: m.homeTeam?.name || m.homeTeam?.shortName,
    away: m.awayTeam?.name || m.awayTeam?.shortName,
    homeBadge: flag(m.homeTeam?.name) || m.homeTeam?.crest || null,
    awayBadge: flag(m.awayTeam?.name) || m.awayTeam?.crest || null,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    status: m.status || "SCHEDULED"
  }));

  const standings = [];
  for (const grp of (sj.standings || [])) {
    if (grp.type !== "TOTAL") continue;
    const raw = grp.group ? String(grp.group).replace(/^GROUP[_\s]/i, "").replace(/^Group\s/i, "") : null;
    const groupName = raw ? `Group ${raw}` : (grp.stage || "—");
    standings.push({
      group: groupName,
      table: (grp.table || []).map((t) => ({
        pos: t.position,
        team: t.team?.name,
        badge: flag(t.team?.name) || t.team?.crest || null,
        played: t.playedGames, won: t.won, drawn: t.draw, lost: t.lost,
        gf: t.goalsFor, ga: t.goalsAgainst, gd: t.goalDifference, pts: t.points
      }))
    });
  }

  return { matches, standings, source: "football-data" };
}

/* ===== BXH tự tính từ tỉ số (khi không có Football-Data) ===== */
function computeStandings(matches) {
  const groups = {};
  // Bước 1: khởi tạo bảng từ tất cả trận group-stage (kể cả chưa đá) để có đủ 4 đội/bảng
  const isPlaceholder = (n) => /^([0-9][A-L]|3[A-L\/]+|W\d+|L\d+)$/i.test(n || "");
  for (const m of matches) {
    if (!m.group) continue;
    if (!groups[m.group]) groups[m.group] = {};
    for (const t of [m.home, m.away]) {
      if (!t || isPlaceholder(t)) continue;
      if (!groups[m.group][t]) groups[m.group][t] = { team: t, badge: flag(t), played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    }
  }
  // Bước 2: cộng dồn từ các trận có tỉ số
  for (const m of matches) {
    if (!m.group || m.homeScore == null || m.awayScore == null) continue;
    const g = m.group;
    if (!groups[g]) groups[g] = {};
    for (const t of [m.home, m.away]) {
      if (!groups[g][t]) groups[g][t] = { team: t, badge: flag(t), played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    }
    const H = groups[g][m.home], A = groups[g][m.away];
    H.played++; A.played++;
    H.gf += m.homeScore; H.ga += m.awayScore;
    A.gf += m.awayScore; A.ga += m.homeScore;
    if (m.homeScore > m.awayScore) { H.won++; H.pts += 3; A.lost++; }
    else if (m.homeScore < m.awayScore) { A.won++; A.pts += 3; H.lost++; }
    else { H.drawn++; A.drawn++; H.pts++; A.pts++; }
  }
  const out = [];
  for (const [group, tmap] of Object.entries(groups)) {
    const table = Object.values(tmap)
      .map((t) => ({ ...t, gd: t.gf - t.ga }))
      .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team))
      .map((t, i) => ({ pos: i + 1, ...t }));
    out.push({ group, table });
  }
  out.sort((a, b) => a.group.localeCompare(b.group));
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=300");

  const now = Date.now();
  if (cache.data && now - cache.ts < TTL_MS) {
    res.setHeader("X-Cache", "HIT");
    return res.status(200).json({ updated: cache.ts, ...cache.data });
  }

  try {
    const key = process.env.FOOTBALL_DATA_API_KEY;
    console.log("[sports] env key present:", !!key, key ? `(len=${key.length})` : "");
    let result;
    if (key) {
      try {
        result = await fromFootballData(key);
        console.log("[sports] using football-data.org (live)");
      } catch (e) {
        console.warn("[sports] FD fail, fallback openfootball:", e.message);
        result = await fromOpenFootball();
      }
    } else {
      result = await fromOpenFootball();
      console.log("[sports] using openfootball (no key)");
    }
    const withScore = result.matches.filter((m) => m.homeScore != null && m.awayScore != null).length;
    console.log(`[sports] total=${result.matches.length} finished=${withScore}`);

    if (!result.standings) result.standings = computeStandings(result.matches);
    result.matches.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const data = {
      league: "FIFA World Cup 2026",
      total: result.matches.length,
      source: result.source,
      matches: result.matches,
      standings: result.standings
    };
    cache = { ts: now, data };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, ...data });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
