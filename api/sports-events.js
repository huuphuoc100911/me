// Diễn biến chi tiết 1 trận từ ESPN (summary) — nguồn duy nhất có bàn thắng/thẻ/thay người
// theo phút cho WC2026 (Football-Data trả rỗng ở bộ dữ liệu này). Khớp trận theo giờ + tên đội.
// Query: /api/sports-events?ts=<ms>&home=<tên>&away=<tên>

const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

// ESPN → tên chuẩn (khớp tên client dùng của Football-Data)
const ESPN_NAME = {
  "Korea Republic": "South Korea", "USA": "United States",
  "Cote d'Ivoire": "Ivory Coast", "Türkiye": "Turkey", "Turkiye": "Turkey",
  "Cabo Verde": "Cape Verde Islands", "Bosnia and Herzegovina": "Bosnia-Herzegovina", "DR Congo": "Congo DR"
};
const enorm = (s) => ESPN_NAME[s] || s;
const nkey = (s) => String(s || "").toLowerCase().replace(/[^a-z]/g, "");
const ymd = (t) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
};

// "24'" → {minute:24}; "45'+6'" → {minute:45, added:6}; "120'+5'" → {minute:120, added:5}
function parseClock(s) {
  const m = String(s || "").match(/(\d+)'(?:\+(\d+)')?/);
  if (!m) return { minute: null, added: null };
  return { minute: parseInt(m[1], 10), added: m[2] ? parseInt(m[2], 10) : null };
}

async function safeJson(url) {
  try { const r = await fetch(url, { headers: { "User-Agent": "DashboardVN/1.0" } }); return r.ok ? await r.json() : null; }
  catch { return null; }
}

function extractEvents(sj) {
  const comp = sj.header?.competitions?.[0];
  const cs = comp?.competitors || [];
  const homeC = cs.find((c) => c.homeAway === "home") || cs[0] || {};
  const awayC = cs.find((c) => c.homeAway === "away") || cs[1] || {};
  const hId = String(homeC.team?.id || homeC.id || "");
  const home = enorm(homeC.team?.displayName), away = enorm(awayC.team?.displayName);
  const sideOf = (e) => String(e.team?.id || "") === hId ? "home" : "away";

  const events = [];
  let hs = 0, as = 0;   // tỉ số chạy theo bàn (ESPN không trả homeScore/awayScore ở keyEvents)
  for (const e of (sj.keyEvents || [])) {
    const txt = ((e.type && (e.type.text || e.type.name)) || "");
    const low = txt.toLowerCase();
    const { minute, added } = parseClock(e.clock?.displayValue);
    const period = e.period?.number || e.period || 0;
    const side = sideOf(e);
    const teamName = side === "home" ? home : away;
    const parts = (e.participants || []).map((p) => p.athlete?.displayName).filter(Boolean);

    if (e.scoringPlay && (/goal/.test(low) || /penalty.*scored/.test(low))) {
      if (period > 4) continue;                  // bỏ loạt luân lưu (hiển thị riêng)
      const kind = /own goal/.test(low) ? "OWN" : /penalty/.test(low) ? "PENALTY" : "REGULAR";
      // Phản lưới → tính cho đội đối phương
      if (kind === "OWN") { if (side === "home") as++; else hs++; }
      else { if (side === "home") hs++; else as++; }
      events.push({
        type: "goal", minute, added, period,
        team: teamName, teamSide: side,
        player: parts[0] || null,
        assist: kind === "PENALTY" ? null : (parts[1] || null),
        kind, score: `${hs}-${as}`
      });
    } else if (/yellow card/.test(low) || (/second yellow|yellow red/.test(low))) {
      const yr = /second yellow|yellow red/.test(low);
      events.push({ type: yr ? "yellowred" : "yellow", minute, added, period, team: teamName, teamSide: side, player: parts[0] || null });
    } else if (/red card/.test(low)) {
      events.push({ type: "red", minute, added, period, team: teamName, teamSide: side, player: parts[0] || null });
    } else if (/substitution/.test(low)) {
      events.push({ type: "sub", minute, added, period, team: teamName, teamSide: side, playerIn: parts[0] || null, playerOut: parts[1] || null });
    }
  }
  events.sort((a, b) => (a.period - b.period) || ((a.minute || 0) - (b.minute || 0)) || ((a.added || 0) - (b.added || 0)));
  return { home, away, events };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");

  const { ts, home, away } = req.query || {};
  const tsN = parseInt(ts, 10);
  if (!tsN || !home) return res.status(200).json({ events: [], note: "Cần param ts + home/away" });

  const ckey = `${tsN}|${nkey(home)}|${nkey(away)}`;
  const now = Date.now();
  const hit = cache.get(ckey);
  if (hit && now - hit.ts < TTL_MS) { res.setHeader("X-Cache", "HIT"); return res.status(200).json(hit.data); }
  const reply = (data) => { cache.set(ckey, { ts: now, data }); return res.status(200).json(data); };

  // Tìm event ESPN trong khung ±1 ngày quanh giờ bóng lăn, khớp theo tên đội + giờ gần nhất
  const range = `${ymd(tsN - 864e5)}-${ymd(tsN + 864e5)}`;
  const sb = await safeJson(`${ESPN_SCOREBOARD}?dates=${range}`);
  if (!sb) return reply({ events: [], note: "Không lấy được lịch ESPN" });

  let best = null, bd = 6 * 3600 * 1000;
  for (const e of (sb.events || [])) {
    const cs = e.competitions?.[0]?.competitors || [];
    const names = cs.map((c) => nkey(enorm(c.team?.displayName)));
    const et = e.date ? Date.parse(e.date) : null;
    if (et == null) continue;
    const matchTeams = names.includes(nkey(home)) || (away && names.includes(nkey(away)));
    if (!matchTeams) continue;
    const dd = Math.abs(et - tsN);
    if (dd < bd) { bd = dd; best = e; }
  }
  if (!best) return reply({ events: [], note: "Chưa có sự kiện chi tiết" });
  if (best.status?.type?.state === "pre") return reply({ events: [], note: "Trận chưa diễn ra" });

  const sj = await safeJson(`${ESPN_SUMMARY}?event=${best.id}`);
  if (!sj) return reply({ events: [], note: "Chưa có sự kiện chi tiết" });

  const out = extractEvents(sj);
  return reply({ ...out, eventId: best.id, source: "espn" });
};
