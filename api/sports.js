// Lịch + BXH FIFA World Cup 2026
// - Mặc định: openfootball/world-cup.json (free, no key) — tỉ số trễ ~vài giờ
// - Nếu env FOOTBALL_DATA_API_KEY có giá trị → ưu tiên Football-Data.org (real-time)
//   Đăng ký key free: https://www.football-data.org/client/register

const OPENFB_URL = "https://raw.githubusercontent.com/openfootball/world-cup.json/master/2026/worldcup.json";
const FD_BASE = "https://api.football-data.org/v4/competitions/WC";
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const TTL_MS = 30 * 1000; // 30s — sàn an toàn cho FD free (10 req/phút, ~4 endpoint/lần fetch)

// ESPN cho tỉ số 120' + luân lưu SẠCH (FD hay gộp luân lưu vào fullTime / trả pen sai).
// Đối chiếu server-side để mọi nơi (sơ đồ, lịch) nhận dữ liệu đúng ngay từ /api/sports.
const ESPN_NAME = {
  "Korea Republic": "South Korea", "USA": "United States",
  "Cote d'Ivoire": "Ivory Coast", "Türkiye": "Turkey", "Turkiye": "Turkey",
  "Cabo Verde": "Cape Verde Islands", "Bosnia and Herzegovina": "Bosnia-Herzegovina", "DR Congo": "Congo DR"
};
const enorm = (s) => ESPN_NAME[s] || s;
const nkey = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");

async function reconcileKnockoutWithEspn(matches) {
  let ej;
  try {
    const r = await fetch(ESPN_SCOREBOARD, { headers: { "User-Agent": "DashboardVN/1.0" } });
    if (!r.ok) return;
    ej = await r.json();
  } catch { return; }
  const pen = (c) => { const v = c.shootoutScore; return (v == null || v === "") ? null : (parseInt(v, 10) || 0); };
  const byTs = {};
  for (const e of (ej.events || [])) {
    if (e.status?.type?.state === "pre") continue;   // chưa đá
    const cs = (e.competitions?.[0]?.competitors) || [];
    const hc = cs.find((c) => c.homeAway === "home") || cs[0] || {};
    const ac = cs.find((c) => c.homeAway === "away") || cs[1] || {};
    const ts = e.date ? Date.parse(e.date) : null;
    if (ts == null) continue;
    byTs[ts] = {
      home: enorm(hc.team?.displayName), away: enorm(ac.team?.displayName),
      hs: parseInt(hc.score, 10) || 0, as: parseInt(ac.score, 10) || 0,
      hp: pen(hc), ap: pen(ac)
    };
  }
  for (const m of matches) {
    if (m.group) continue;             // chỉ trận knockout
    const e = byTs[m.ts];
    if (!e) continue;
    if (nkey(e.home) === nkey(m.home) || nkey(e.away) === nkey(m.away)) {
      m.homeScore = e.hs; m.awayScore = e.as; m.homePen = e.hp; m.awayPen = e.ap;
    } else if (nkey(e.home) === nkey(m.away) || nkey(e.away) === nkey(m.home)) {
      m.homeScore = e.as; m.awayScore = e.hs; m.homePen = e.ap; m.awayPen = e.hp;
    }
  }
}

let cache = { ts: 0, data: null };

const FLAG_ISO = {
  "algeria":"dz","argentina":"ar","australia":"au","austria":"at","belgium":"be",
  "bosnia & herzegovina":"ba","bosnia and herzegovina":"ba","bosnia-herzegovina":"ba","bosnia":"ba",
  "brazil":"br","canada":"ca","cape verde":"cv","cabo verde":"cv",
  "colombia":"co","croatia":"hr","curaçao":"cw","curacao":"cw",
  "czech republic":"cz","czechia":"cz",
  "dr congo":"cd","democratic republic of the congo":"cd","congo dr":"cd",
  "ecuador":"ec","egypt":"eg","england":"gb-eng","france":"fr","germany":"de",
  "ghana":"gh","haiti":"ht","iran":"ir","iraq":"iq",
  "ivory coast":"ci","côte d'ivoire":"ci","cote d'ivoire":"ci",
  "italy":"it","japan":"jp","jordan":"jo","mexico":"mx","morocco":"ma",
  "netherlands":"nl","new zealand":"nz","norway":"no","panama":"pa","paraguay":"py",
  "portugal":"pt","qatar":"qa","saudi arabia":"sa","scotland":"gb-sct","senegal":"sn",
  "south africa":"za","south korea":"kr","korea republic":"kr","republic of korea":"kr",
  "spain":"es","sweden":"se","switzerland":"ch","tunisia":"tn",
  "turkey":"tr","türkiye":"tr","turkiye":"tr",
  "usa":"us","united states":"us","united states of america":"us",
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
  const matches = (j.matches || []).map((m) => {
    // openfootball mới dùng score.ft = [home, away]; bản cũ dùng score1/score2 → hỗ trợ cả 2
    const ft = m.score && Array.isArray(m.score.ft) ? m.score.ft : null;
    const s1 = ft ? ft[0] : (m.score1 != null ? m.score1 : null);
    const s2 = ft ? ft[1] : (m.score2 != null ? m.score2 : null);
    return {
      num: m.num != null ? m.num : null,   // số hiệu trận → resolve "W74"/"L101" ở knockout
      ts: parseKickoff(m.date, m.time),
      date: m.date,
      round: m.round || null,
      group: m.group || null,
      venue: m.ground || null,
      home: m.team1,
      away: m.team2,
      homeBadge: flag(m.team1),
      awayBadge: flag(m.team2),
      homeScore: s1 != null ? s1 : null,
      awayScore: s2 != null ? s2 : null,
      status: (s1 != null && s2 != null) ? "FINISHED" : "SCHEDULED"
    };
  });
  return { matches, source: "openfootball" };
}

/* ===== Nguồn 2: Football-Data.org (cần key) ===== */
async function fromFootballData(key) {
  const headers = { "X-Auth-Token": key, "User-Agent": "DashboardVN/1.0" };
  const [mr, sr, tr, ta] = await Promise.all([
    fetch(FD_BASE + "/matches", { headers }),
    fetch(FD_BASE + "/standings", { headers }),
    fetch(FD_BASE + "/scorers?limit=20", { headers }),
    // Thử endpoint riêng theo assists (FD có thể không hỗ trợ sortBy ở tier free — fail silently)
    fetch(FD_BASE + "/scorers?limit=20&sortBy=ASSISTS", { headers }).catch(() => ({ ok: false }))
  ]);
  if (!mr.ok) throw new Error("FD matches " + mr.status);
  const mj = await mr.json();
  const sj = sr.ok ? await sr.json() : { standings: [] };
  const tj = tr.ok ? await tr.json() : { scorers: [] };
  const taj = ta.ok ? await ta.json() : { scorers: [] };

  const matches = (mj.matches || []).map((m) => {
    // FD gộp luân lưu vào fullTime (vd 1-1 + pen 3-4 → fullTime 4-5).
    // Tách: homeScore/awayScore = tỉ số 120'; homePen/awayPen = loạt luân lưu.
    const ft = m.score?.fullTime || {};
    const pen = m.score?.penalties;
    const hasPen = pen && pen.home != null && pen.away != null;
    return {
      fdId: m.id || null,
      ts: m.utcDate ? Date.parse(m.utcDate) : null,
      date: m.utcDate ? m.utcDate.slice(0, 10) : null,
      round: m.matchday ? `Matchday ${m.matchday}` : (m.stage || null),
      group: m.group || null,
      venue: null,
      home: m.homeTeam?.name || m.homeTeam?.shortName,
      away: m.awayTeam?.name || m.awayTeam?.shortName,
      homeBadge: flag(m.homeTeam?.name) || m.homeTeam?.crest || null,
      awayBadge: flag(m.awayTeam?.name) || m.awayTeam?.crest || null,
      homeScore: ft.home != null ? (hasPen ? ft.home - pen.home : ft.home) : null,
      awayScore: ft.away != null ? (hasPen ? ft.away - pen.away : ft.away) : null,
      homePen: hasPen ? pen.home : null,
      awayPen: hasPen ? pen.away : null,
      status: m.status || "SCHEDULED"
    };
  });

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

  const mapScorer = (s) => ({
    player: s.player?.name,
    nationality: s.player?.nationality || s.team?.name,
    teamBadge: flag(s.team?.name) || s.team?.crest || null,
    team: s.team?.name,
    goals: s.goals,
    assists: s.assists,
    penalties: s.penalties,
    matches: s.playedMatches
  });
  // Merge 2 nguồn theo player name, ưu tiên giá trị max
  // (FD có thể trả cùng player ở cả 2 list với số liệu giống nhau,
  // nhưng nếu sortBy=ASSISTS không hỗ trợ thì taj = tj — dedup vẫn an toàn)
  const byName = new Map();
  for (const s of [...(tj.scorers || []), ...(taj.scorers || [])]) {
    const m = mapScorer(s);
    if (!m.player) continue;
    const ex = byName.get(m.player);
    if (!ex) byName.set(m.player, m);
    else {
      ex.goals = Math.max(ex.goals ?? 0, m.goals ?? 0);
      ex.assists = Math.max(ex.assists ?? 0, m.assists ?? 0);
      ex.penalties = Math.max(ex.penalties ?? 0, m.penalties ?? 0);
      ex.matches = Math.max(ex.matches ?? 0, m.matches ?? 0);
    }
  }
  const scorers = [...byName.values()];

  return { matches, standings, scorers, source: "football-data" };
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
  // Bỏ stale-while-revalidate vì nó cho phép CDN trả data cũ thêm 30s → live trễ
  res.setHeader("Cache-Control", "public, s-maxage=30, max-age=0");

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
    await reconcileKnockoutWithEspn(result.matches);  // tỉ số 120' + luân lưu sạch từ ESPN
    result.matches.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    const data = {
      league: "FIFA World Cup 2026",
      total: result.matches.length,
      source: result.source,
      matches: result.matches,
      standings: result.standings,
      scorers: result.scorers || []
    };
    cache = { ts: now, data };
    res.setHeader("X-Cache", "MISS");
    return res.status(200).json({ updated: now, ...data });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
};
