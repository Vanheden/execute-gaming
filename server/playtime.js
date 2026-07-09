// ---------------------------------------------------------------------------
// Playtime — ingests play sessions from the in-game mod and ranks players.
// ---------------------------------------------------------------------------
// The BepInEx mod on the V Rising server POSTs a session per connect (keyed by a
// mod-issued sessionId), then re-POSTs the same sessionId on heartbeat/disconnect
// with updated `seconds`/`endedAt`. We UPSERT by sessionId, so repeated posts are
// idempotent and a crash just loses at most one heartbeat interval — the last
// write wins and nothing is double-counted. See CLAUDE.md / ROADMAP.md.
// ---------------------------------------------------------------------------
import { db } from './db.js'
import { servers } from '../src/data/servers.js'

const SERVER_IDS = new Set(servers.map((s) => s.id))
// A single session can't sensibly exceed a few days; cap to reject garbage.
const MAX_SECONDS = 7 * 24 * 3600

const upsertStmt = db.prepare(
  `INSERT INTO play_sessions
     (sessionId, serverId, steamId, charName, startedAt, endedAt, seconds, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(sessionId) DO UPDATE SET
     charName  = excluded.charName,
     endedAt   = excluded.endedAt,
     seconds   = excluded.seconds,
     updatedAt = excluded.updatedAt`,
)

// Validate + record one session upsert from the mod. Returns { ok } or
// { error } with a reason the route turns into a 400.
export function recordSession(body) {
  const sessionId = str(body?.sessionId, 100)
  if (!sessionId) return { error: 'sessionId required' }

  const serverId = str(body?.serverId, 60)
  if (!serverId || !SERVER_IDS.has(serverId)) return { error: 'unknown serverId' }

  // SteamID64 is a 17-digit number; accept it as a string to avoid precision loss.
  const steamId = str(body?.steamId, 20)
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return { error: 'invalid steamId' }

  const startedAt = isoOrNull(body?.startedAt)
  if (!startedAt) return { error: 'invalid startedAt' }
  const endedAt = body?.endedAt == null ? null : isoOrNull(body.endedAt)
  if (body?.endedAt != null && !endedAt) return { error: 'invalid endedAt' }

  // Missing seconds defaults to 0 (e.g. a fresh connect with no elapsed time yet).
  let seconds = body?.seconds == null ? 0 : Number(body.seconds)
  if (!Number.isFinite(seconds) || seconds < 0) return { error: 'invalid seconds' }
  seconds = Math.min(Math.floor(seconds), MAX_SECONDS)

  const charName = body?.charName ? str(body.charName, 60) : null

  upsertStmt.run(
    sessionId,
    serverId,
    steamId,
    charName,
    startedAt,
    endedAt,
    seconds,
    new Date().toISOString(),
  )
  return { ok: true }
}

// --- Kill events (V Blood boss kills + PvP kills) ---------------------------
// Same secret-guarded ingest path as sessions, but discrete: the mod POSTs one
// event per kill, keyed by a mod-issued eventId so a network retry can't double
// count (INSERT OR IGNORE). kind is 'vblood' or 'pvp'.
const KILL_KINDS = new Set(['vblood', 'pvp'])

const insertKillStmt = db.prepare(
  `INSERT OR IGNORE INTO kill_events
     (eventId, serverId, steamId, charName, kind, victim, occurredAt, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
)

// Validate + record one kill event from the mod. Returns { ok } or { error }.
export function recordKill(body) {
  const eventId = str(body?.eventId, 100)
  if (!eventId) return { error: 'eventId required' }

  const serverId = str(body?.serverId, 60)
  if (!serverId || !SERVER_IDS.has(serverId)) return { error: 'unknown serverId' }

  const steamId = str(body?.steamId, 20)
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return { error: 'invalid steamId' }

  const kind = str(body?.kind, 20)
  if (!kind || !KILL_KINDS.has(kind)) return { error: 'invalid kind' }

  const occurredAt = isoOrNull(body?.occurredAt)
  if (!occurredAt) return { error: 'invalid occurredAt' }

  const charName = body?.charName ? str(body.charName, 60) : null
  const victim = body?.victim ? str(body.victim, 100) : null

  insertKillStmt.run(
    eventId,
    serverId,
    steamId,
    charName,
    kind,
    victim,
    occurredAt,
    new Date().toISOString(),
  )
  return { ok: true }
}

// Points weighting for the combined "Points" ranking. The leaderboard recomputes
// from raw sessions/events on every request, so tweaking these reweights the whole
// history immediately — no backfill needed.
//
// V Blood kills reward *variety*: the FIRST time a player fells a given boss it's
// worth `perVBloodFirst`; every repeat kill of that same boss is worth the smaller
// `perVBloodRepeat`. So a player's V Blood points = distinctBosses·first +
// (totalVBloodKills − distinctBosses)·repeat. This is computed in SQL from a
// COUNT(DISTINCT victim), so no per-kill flag is stored — reweighting stays instant.
export const POINTS = {
  perHour: 10, // 10 pts per hour played
  perVBloodFirst: 50, // 50 pts the first time you kill a given V Blood boss
  perVBloodRepeat: 25, // 25 pts for each repeat kill of a boss you've already felled
  perPvpKill: 15, // 15 pts per PvP kill
}

// Windows the leaderboard supports: label → cutoff in days (null = all-time).
const PERIODS = { all: null, '30d': 30, '7d': 7 }

// The rankable metrics. `col` is the aggregate column to sort/filter on; a row is
// only shown if that column is > 0 (so e.g. the PvP tab omits players with 0 kills).
const METRICS = {
  points: 'points',
  playtime: 'seconds',
  vblood: 'vblood',
  pvp: 'pvp',
}

// Unified leaderboard across playtime + kills, ranked by `metric`. Each row carries
// every metric (seconds/sessions/vblood/pvp/points) so the UI can show a breakdown
// on the Points tab. `serverId` null = all servers. index.js links rows to accounts.
export function getLeaderboard({ serverId = null, period = 'all', metric = 'points', limit = 100 } = {}) {
  const col = METRICS[metric] ?? METRICS.points
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500)

  // Aggregate playtime and kills separately (each filtered on its own time column),
  // union the SteamIDs, then join. Points is derived from the weights. Wrapped in an
  // outer SELECT so we can filter/sort on the derived aliases.
  const sql = `
    SELECT * FROM (
      SELECT ids.steamId AS steamId,
             COALESCE(p.seconds, 0)  AS seconds,
             COALESCE(p.sessions, 0) AS sessions,
             COALESCE(k.vblood, 0)   AS vblood,
             COALESCE(k.pvp, 0)      AS pvp,
             MAX(COALESCE(p.lastSeen, '0'), COALESCE(k.lastKill, '0')) AS lastSeen,
             -- V Blood points: distinct bosses at the first-kill rate, the rest
             -- (repeat kills of an already-felled boss) at the lower repeat rate.
             CAST(
               COALESCE(p.seconds, 0) / 3600.0 * ?3
               + COALESCE(k.vbloodDistinct, 0) * ?4
               + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?5
               + COALESCE(k.pvp, 0) * ?6
             AS INTEGER) AS points,
             (SELECT charName FROM (
                SELECT charName, startedAt AS t FROM play_sessions
                  WHERE steamId = ids.steamId AND charName IS NOT NULL
                UNION ALL
                SELECT charName, occurredAt AS t FROM kill_events
                  WHERE steamId = ids.steamId AND charName IS NOT NULL
              ) ORDER BY t DESC LIMIT 1) AS charName,
             -- Latest V Blood boss this player killed (in-window), for "Latest Kill".
             -- Both subqueries share the same filter+order so they read the same row.
             (SELECT victim FROM kill_events
                WHERE steamId = ids.steamId AND kind = 'vblood' AND victim IS NOT NULL
                  AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2
                ORDER BY occurredAt DESC LIMIT 1) AS lastVBlood,
             (SELECT occurredAt FROM kill_events
                WHERE steamId = ids.steamId AND kind = 'vblood' AND victim IS NOT NULL
                  AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2
                ORDER BY occurredAt DESC LIMIT 1) AS lastVBloodAt
        FROM (
          SELECT steamId FROM play_sessions
            WHERE (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2
          UNION
          SELECT steamId FROM kill_events
            WHERE (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2
        ) ids
        LEFT JOIN (
          SELECT steamId, SUM(seconds) AS seconds, COUNT(*) AS sessions, MAX(updatedAt) AS lastSeen
            FROM play_sessions
           WHERE (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2
           GROUP BY steamId
        ) p ON p.steamId = ids.steamId
        LEFT JOIN (
          SELECT steamId,
                 SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
                 COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                     THEN victim END)              AS vbloodDistinct,
                 SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp,
                 MAX(occurredAt) AS lastKill
            FROM kill_events
           WHERE (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2
           GROUP BY steamId
        ) k ON k.steamId = ids.steamId
    )
    WHERE ${col} > 0
    ORDER BY ${col} DESC, lastSeen DESC
    LIMIT ?7`

  return db
    .prepare(sql)
    .all(
      serverId,
      since,
      POINTS.perHour,
      POINTS.perVBloodFirst,
      POINTS.perVBloodRepeat,
      POINTS.perPvpKill,
      cap,
    )
}

// All-time points per SteamID, independent of any period/server filter — the rank
// badge always reflects lifetime progress (see src/data/ranks.js). Uses the same
// first-vs-repeat V Blood weighting as the leaderboard. Returns a plain object map
// { steamId: points }. Unknown/empty ids yield {}.
export function allTimePoints(steamIds) {
  const ids = [...new Set((steamIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const values = ids.map(() => '(?)').join(',')
  const sql = `
    WITH ids(steamId) AS (VALUES ${values})
    SELECT ids.steamId AS steamId,
           CAST(
             COALESCE(p.seconds, 0) / 3600.0 * ?
             + COALESCE(k.vbloodDistinct, 0) * ?
             + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
             + COALESCE(k.pvp, 0) * ?
           AS INTEGER) AS points
      FROM ids
      LEFT JOIN (
        SELECT steamId, SUM(seconds) AS seconds FROM play_sessions GROUP BY steamId
      ) p ON p.steamId = ids.steamId
      LEFT JOIN (
        SELECT steamId,
               SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
               COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                   THEN victim END)              AS vbloodDistinct,
               SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
          FROM kill_events GROUP BY steamId
      ) k ON k.steamId = ids.steamId`

  const rows = db
    .prepare(sql)
    .all(...ids, POINTS.perHour, POINTS.perVBloodFirst, POINTS.perVBloodRepeat, POINTS.perPvpKill)
  return Object.fromEntries(rows.map((r) => [r.steamId, r.points]))
}

export const LEADERBOARD_PERIODS = Object.keys(PERIODS)
export const LEADERBOARD_METRICS = Object.keys(METRICS)

// --- helpers ---------------------------------------------------------------
function str(v, max) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > max) return null
  return t
}

function isoOrNull(v) {
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
