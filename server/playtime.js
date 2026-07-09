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

// --- Per-server leaderboard resets ("season wipe") --------------------------
// A reset stores a cutoff timestamp per server (JSON { serverId: { cutoff, previous } }
// under the `leaderboard_resets` settings key). The leaderboard and ranks then only
// count a server's activity at/after its cutoff. This is non-destructive (raw
// sessions/kills are kept) and reversible — clearing the cutoff restores the full
// history. Re-resetting saves the old cutoff as `previous` so you can restore to it
// (a rolling one-step backup). Fits the PvP server's monthly wipe.

// Internal: read the raw stored map (with { cutoff, previous } per server).
function readResetMap() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'leaderboard_resets'").get()
  if (!row?.value) return {}
  try {
    const map = JSON.parse(row.value)
    const out = {}
    for (const [id, val] of Object.entries(map)) {
      if (!SERVER_IDS.has(id)) continue
      // Backwards compat: old format was a bare ISO string.
      if (typeof val === 'string') out[id] = { cutoff: val, previous: null }
      else if (val?.cutoff) out[id] = { cutoff: val.cutoff, previous: val.previous || null }
    }
    return out
  } catch {
    return {}
  }
}

function saveResetMap(map) {
  const clean = Object.fromEntries(
    Object.entries(map).filter(([id, v]) => SERVER_IDS.has(id) && v?.cutoff),
  )
  if (!Object.keys(clean).length) {
    db.prepare("DELETE FROM settings WHERE key = 'leaderboard_resets'").run()
    return {}
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('leaderboard_resets', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(clean))
  return clean
}

// Flattened { serverId: cutoffIso } for SQL floor logic.
export function getLeaderboardResets() {
  const map = readResetMap()
  return Object.fromEntries(
    Object.entries(map).map(([id, v]) => [id, v.cutoff]),
  )
}

// Full structure { serverId: { cutoff, previous } } for the admin UI.
export function getLeaderboardResetsAdmin() {
  return readResetMap()
}

// Set a server's reset cutoff to `at` (default now), or clear it when at === null.
// Re-resetting (cutoff already set) moves the old cutoff to `previous` — a rolling
// one-step backup so you can restore to the prior season. Returns { resets } or
// { error } for an unknown serverId.
export function setLeaderboardReset(serverId, at = new Date().toISOString()) {
  if (!SERVER_IDS.has(serverId)) return { error: 'unknown serverId' }
  const map = readResetMap()
  if (at === null) {
    delete map[serverId]
  } else {
    const existing = map[serverId]
    map[serverId] = { cutoff: at, previous: existing?.cutoff || null }
  }
  return { resets: saveResetMap(map) }
}

// Restore a server's cutoff to its `previous` value (undo a re-reset). Clears
// previous afterwards. Returns { resets } or { error }.
export function restoreLeaderboardReset(serverId) {
  if (!SERVER_IDS.has(serverId)) return { error: 'unknown serverId' }
  const map = readResetMap()
  const entry = map[serverId]
  if (!entry?.previous) return { error: 'no previous cutoff' }
  map[serverId] = { cutoff: entry.previous, previous: null }
  return { resets: saveResetMap(map) }
}

// Get the top-1 player for a server within a time range (for season champions).
// `from` and `to` are ISO strings; `from` null = beginning of time. Returns
// { steamId, charName, points } or null.
function getSeasonChampion(serverId, from, to) {
  const fromIso = from || '0'
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  // Temporarily ignore this server's own reset floor for champion queries,
  // since we're querying within a specific pre-reset window.
  // We still apply OTHER servers' floors (irrelevant since we filter by serverId).
  const sql = `
    SELECT ids.steamId AS steamId,
           COALESCE(p.seconds, 0) AS seconds,
           COALESCE(k.vblood, 0)  AS vblood,
           COALESCE(k.pvp, 0)     AS pvp,
           CAST(
             COALESCE(p.seconds, 0) / 3600.0 * ?
             + COALESCE(k.vbloodDistinct, 0) * ?
             + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
             + COALESCE(k.pvp, 0) * ?
           AS INTEGER) AS points,
           (SELECT charName FROM (
              SELECT charName, startedAt AS t FROM play_sessions
                WHERE steamId = ids.steamId AND charName IS NOT NULL
              UNION ALL
              SELECT charName, occurredAt AS t FROM kill_events
                WHERE steamId = ids.steamId AND charName IS NOT NULL
            ) ORDER BY t DESC LIMIT 1) AS charName
    FROM (
      SELECT steamId FROM play_sessions
        WHERE serverId = ? AND startedAt >= ? AND startedAt < ?
      UNION
      SELECT steamId FROM kill_events
        WHERE serverId = ? AND occurredAt >= ? AND occurredAt < ?
    ) ids
    LEFT JOIN (
      SELECT steamId, SUM(seconds) AS seconds FROM play_sessions
        WHERE serverId = ? AND startedAt >= ? AND startedAt < ?
      GROUP BY steamId
    ) p ON p.steamId = ids.steamId
    LEFT JOIN (
      SELECT steamId,
             SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
             COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                 THEN victim END)              AS vbloodDistinct,
             SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
        FROM kill_events
       WHERE serverId = ? AND occurredAt >= ? AND occurredAt < ?
      GROUP BY steamId
    ) k ON k.steamId = ids.steamId
    ORDER BY points DESC, seconds DESC
    LIMIT 1`

  const row = db.prepare(sql).get(
    POINTS.perHour, POINTS.perVBloodFirst, POINTS.perVBloodRepeat, POINTS.perPvpKill,
    serverId, fromIso, to,
    serverId, fromIso, to,
    serverId, fromIso, to,
    serverId, fromIso, to,
  )

  if (!row || row.points === 0) return null
  return { steamId: row.steamId, charName: row.charName, points: row.points }
}

// Get all season champions for a server — the top-1 player for each completed
// season (between consecutive resets). Returns an array of
// { seasonStart, seasonEnd, steamId, charName, points } newest first.
export function getSeasonChampions(serverId) {
  if (!SERVER_IDS.has(serverId)) return []
  const map = readResetMap()
  const entry = map[serverId]
  if (!entry) return []

  const seasons = []
  // The current cutoff is the END of the last completed season.
  // If there's a `previous`, we have two seasons: [previous, cutoff] and [null, previous].
  if (entry.previous) {
    const champ1 = getSeasonChampion(serverId, entry.previous, entry.cutoff)
    if (champ1) seasons.push({ seasonStart: entry.previous, seasonEnd: entry.cutoff, ...champ1 })
  }
  const champ0 = getSeasonChampion(serverId, null, entry.cutoff)
  if (champ0) seasons.push({ seasonStart: null, seasonEnd: entry.cutoff, ...champ0 })

  return seasons
}

// Build an SQL fragment enforcing each reset cutoff on a time column `col`, using
// numbered params starting at `base` (so the same cutoffs can be referenced in
// several places). serverIds come from our own config (safe to inline); the cutoffs
// are bound parameters. Returns '' when no resets are set (query unchanged).
function resetFloorSql(col, entries, base) {
  if (!entries.length) return ''
  const whens = entries.map(([id], i) => `WHEN '${id}' THEN ?${base + i}`).join(' ')
  return ` AND ${col} >= CASE serverId ${whens} ELSE '0' END`
}

// Same reset floor for anonymous-parameter queries: returns { sql, params } so the
// caller can splice the cutoff params into its positional argument list.
function resetFloorAnon(col, entries) {
  if (!entries.length) return { sql: '', params: [] }
  const whens = entries.map(([id]) => `WHEN '${id}' THEN ?`).join(' ')
  return { sql: ` AND ${col} >= CASE serverId ${whens} ELSE '0' END`, params: entries.map(([, iso]) => iso) }
}

// Unified leaderboard across playtime + kills, ranked by `metric`. Each row carries
// every metric (seconds/sessions/vblood/pvp/points) so the UI can show a breakdown
// on the Points tab. `serverId` null = all servers. index.js links rows to accounts.
export function getLeaderboard({ serverId = null, period = 'all', metric = 'points', limit = 100 } = {}) {
  const col = METRICS[metric] ?? METRICS.points
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500)

  // Per-server season resets: only count each server's activity at/after its cutoff.
  // Referenced as numbered params ?8.. (the same cutoffs reused across all the time
  // filters below). Empty when no resets are set, leaving the query unchanged.
  const resetEntries = Object.entries(getLeaderboardResets())
  const resetParams = resetEntries.map(([, iso]) => iso)
  const floorS = resetFloorSql('startedAt', resetEntries, 8)
  const floorK = resetFloorSql('occurredAt', resetEntries, 8)

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
                  AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
                ORDER BY occurredAt DESC LIMIT 1) AS lastVBlood,
             (SELECT occurredAt FROM kill_events
                WHERE steamId = ids.steamId AND kind = 'vblood' AND victim IS NOT NULL
                  AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
                ORDER BY occurredAt DESC LIMIT 1) AS lastVBloodAt
        FROM (
          SELECT steamId FROM play_sessions
            WHERE (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2${floorS}
          UNION
          SELECT steamId FROM kill_events
            WHERE (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
        ) ids
        LEFT JOIN (
          SELECT steamId, SUM(seconds) AS seconds, COUNT(*) AS sessions, MAX(updatedAt) AS lastSeen
            FROM play_sessions
           WHERE (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2${floorS}
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
           WHERE (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
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
      ...resetParams,
    )
}

// All-time points per SteamID, independent of any *period* filter — the rank badge
// always reflects lifetime progress (see src/data/ranks.js). Uses the same
// first-vs-repeat V Blood weighting as the leaderboard. Pass a `serverId` to scope
// the total to one server (per-server rank); `null`/omitted sums across all servers
// (the global rank). Returns a plain object map { steamId: points }. Unknown/empty
// ids yield {}.
export function allTimePoints(steamIds, serverId = null) {
  const ids = [...new Set((steamIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const values = ids.map(() => '(?)').join(',')

  // Apply the same per-server season resets as the leaderboard, so the rank drops
  // when a server is wiped. Positional params (this query is all-anonymous), so each
  // subquery gets its own copy of the cutoff params in textual order.
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorP = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

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
        SELECT steamId, SUM(seconds) AS seconds FROM play_sessions
         WHERE (? IS NULL OR serverId = ?)${floorP.sql} GROUP BY steamId
      ) p ON p.steamId = ids.steamId
      LEFT JOIN (
        SELECT steamId,
               SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
               COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                   THEN victim END)              AS vbloodDistinct,
               SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
          FROM kill_events
         WHERE (? IS NULL OR serverId = ?)${floorK.sql} GROUP BY steamId
      ) k ON k.steamId = ids.steamId`

  const rows = db
    .prepare(sql)
    .all(
      ...ids,
      POINTS.perHour,
      POINTS.perVBloodFirst,
      POINTS.perVBloodRepeat,
      POINTS.perPvpKill,
      serverId,
      serverId,
      ...floorP.params,
      serverId,
      serverId,
      ...floorK.params,
    )
  return Object.fromEntries(rows.map((r) => [r.steamId, r.points]))
}

export const LEADERBOARD_PERIODS = Object.keys(PERIODS)
export const LEADERBOARD_METRICS = Object.keys(METRICS)

// Lightweight aggregate totals for a single SteamID — used by the auto-achievement
// system to check stat-based badges. Returns { seconds, vblood, pvp, points } or
// null for an invalid/unknown SteamID. Respects season-reset floors.
export function getPlayerTotals(steamId) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return null

  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  const sql = `
    SELECT
      COALESCE(p.seconds, 0) AS seconds,
      COALESCE(k.vblood, 0)  AS vblood,
      COALESCE(k.pvp, 0)     AS pvp,
      CAST(
        COALESCE(p.seconds, 0) / 3600.0 * ?
        + COALESCE(k.vbloodDistinct, 0) * ?
        + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
        + COALESCE(k.pvp, 0) * ?
      AS INTEGER) AS points
    FROM (SELECT 1) dummy
    LEFT JOIN (
      SELECT SUM(seconds) AS seconds FROM play_sessions
       WHERE steamId = ?${floorS.sql}
    ) p ON 1=1
    LEFT JOIN (
      SELECT
        SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
        COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                            THEN victim END)              AS vbloodDistinct,
        SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
      FROM kill_events
       WHERE steamId = ?${floorK.sql}
    ) k ON 1=1`

  const row = db.prepare(sql).get(
    POINTS.perHour,
    POINTS.perVBloodFirst,
    POINTS.perVBloodRepeat,
    POINTS.perPvpKill,
    steamId, ...floorS.params,
    steamId, ...floorK.params,
  )

  if (!row) return null
  return { seconds: row.seconds, vblood: row.vblood, pvp: row.pvp, points: row.points }
}

// Batch version of getPlayerTotals for multiple SteamIDs at once — used by the
// achievement catalog to count holders of game-stat badges. Returns a map
// { steamId: { seconds, vblood, pvp, points } }. Respects season-reset floors.
export function getPlayerTotalsBatch(steamIds) {
  const ids = [...new Set((steamIds || []).filter(Boolean))]
  if (!ids.length) return {}

  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)
  const placeholders = ids.map(() => '(?)').join(',')

  const sql = `
    WITH ids(steamId) AS (VALUES ${placeholders})
    SELECT ids.steamId AS steamId,
           COALESCE(p.seconds, 0) AS seconds,
           COALESCE(k.vblood, 0)  AS vblood,
           COALESCE(k.pvp, 0)     AS pvp,
           CAST(
             COALESCE(p.seconds, 0) / 3600.0 * ?
             + COALESCE(k.vbloodDistinct, 0) * ?
             + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
             + COALESCE(k.pvp, 0) * ?
           AS INTEGER) AS points
    FROM ids
    LEFT JOIN (
      SELECT steamId, SUM(seconds) AS seconds FROM play_sessions
       WHERE steamId IN (SELECT steamId FROM ids)${floorS.sql} GROUP BY steamId
    ) p ON p.steamId = ids.steamId
    LEFT JOIN (
      SELECT steamId,
             SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
             COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                 THEN victim END)              AS vbloodDistinct,
             SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
        FROM kill_events
       WHERE steamId IN (SELECT steamId FROM ids)${floorK.sql} GROUP BY steamId
    ) k ON k.steamId = ids.steamId`

  const rows = db.prepare(sql).all(
    ...ids,
    POINTS.perHour,
    POINTS.perVBloodFirst,
    POINTS.perVBloodRepeat,
    POINTS.perPvpKill,
    ...floorS.params,
    ...floorK.params,
  )

  return Object.fromEntries(
    rows.map((r) => [r.steamId, { seconds: r.seconds, vblood: r.vblood, pvp: r.pvp, points: r.points }]),
  )
}

// Stats for a single player by SteamID — used by /api/player/:steamId for the
// public player profile page (/p/:steamId). Returns per-server breakdown plus
// overall totals, respecting the same season-reset floors as the leaderboard.
// Returns null for an invalid SteamID or a player with no activity.
export function getPlayerStats(steamId) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return null

  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  // Per-server aggregation (same pattern as getLeaderboard, but for one SteamID
  // and grouped by serverId instead of globally ranked).
  const sql = `
    SELECT ids.serverId AS serverId,
           COALESCE(p.seconds, 0)  AS seconds,
           COALESCE(p.sessions, 0) AS sessions,
           COALESCE(k.vblood, 0)   AS vblood,
           COALESCE(k.vbloodDistinct, 0) AS vbloodDistinct,
           COALESCE(k.pvp, 0)      AS pvp,
           CAST(
             COALESCE(p.seconds, 0) / 3600.0 * ?
             + COALESCE(k.vbloodDistinct, 0) * ?
             + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
             + COALESCE(k.pvp, 0) * ?
           AS INTEGER) AS points,
           MAX(COALESCE(p.lastSeen, '0'), COALESCE(k.lastKill, '0')) AS lastSeen
    FROM (
      SELECT serverId FROM play_sessions
        WHERE steamId = ?${floorS.sql} GROUP BY serverId
      UNION
      SELECT serverId FROM kill_events
        WHERE steamId = ?${floorK.sql} GROUP BY serverId
    ) ids
    LEFT JOIN (
      SELECT serverId, SUM(seconds) AS seconds, COUNT(*) AS sessions, MAX(updatedAt) AS lastSeen
        FROM play_sessions
       WHERE steamId = ?${floorS.sql} GROUP BY serverId
    ) p ON p.serverId = ids.serverId
    LEFT JOIN (
      SELECT serverId,
             SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
             COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                 THEN victim END)              AS vbloodDistinct,
             SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp,
             MAX(occurredAt) AS lastKill
        FROM kill_events
       WHERE steamId = ?${floorK.sql} GROUP BY serverId
    ) k ON k.serverId = ids.serverId`

  const rows = db.prepare(sql).all(
    POINTS.perHour,
    POINTS.perVBloodFirst,
    POINTS.perVBloodRepeat,
    POINTS.perPvpKill,
    steamId, ...floorS.params,
    steamId, ...floorK.params,
    steamId, ...floorS.params,
    steamId, ...floorK.params,
  )

  if (!rows.length) return null

  const totalSeconds = rows.reduce((s, r) => s + r.seconds, 0)
  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0)
  const totalVBlood = rows.reduce((s, r) => s + r.vblood, 0)
  const totalPvp = rows.reduce((s, r) => s + r.pvp, 0)
  const totalPoints = rows.reduce((s, r) => s + r.points, 0)
  const lastSeen = rows.reduce((m, r) => (r.lastSeen > m ? r.lastSeen : m), '0')

  // Latest V Blood kill across all servers
  const latestRow = db
    .prepare(
      `SELECT victim, occurredAt FROM kill_events
         WHERE steamId = ? AND kind = 'vblood' AND victim IS NOT NULL${floorK.sql}
         ORDER BY occurredAt DESC LIMIT 1`,
    )
    .get(steamId, ...floorK.params)

  // Most recent charName across sessions + kill events
  const nameRow = db
    .prepare(
      `SELECT charName FROM (
         SELECT charName, startedAt AS t FROM play_sessions
           WHERE steamId = ? AND charName IS NOT NULL
         UNION ALL
         SELECT charName, occurredAt AS t FROM kill_events
           WHERE steamId = ? AND charName IS NOT NULL
       ) ORDER BY t DESC LIMIT 1`,
    )
    .get(steamId, steamId)

  return {
    steamId,
    charName: nameRow?.charName || null,
    seconds: totalSeconds,
    sessions: totalSessions,
    vblood: totalVBlood,
    pvp: totalPvp,
    points: totalPoints,
    lastSeen: lastSeen === '0' ? null : lastSeen,
    latestVBlood: latestRow
      ? { id: latestRow.victim, at: latestRow.occurredAt }
      : null,
    perServer: rows
      .filter((r) => r.seconds > 0 || r.vblood > 0 || r.pvp > 0)
      .map((r) => ({
        serverId: r.serverId,
        seconds: r.seconds,
        sessions: r.sessions,
        vblood: r.vblood,
        pvp: r.pvp,
        points: r.points,
      })),
  }
}

// Recent kill events for the live kill feed. Returns the latest N kills across
// all servers (or one server), newest first. Each row: { steamId, charName, kind,
// victim, occurredAt, serverId }. Respects season-reset floors.
export function getRecentKills(serverId = null, limit = 20) {
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorK = resetFloorAnon('occurredAt', resetEntries)
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100)

  const sql = `
    SELECT steamId, charName, kind, victim, occurredAt, serverId
      FROM kill_events
     WHERE (? IS NULL OR serverId = ?)${floorK.sql}
     ORDER BY occurredAt DESC
     LIMIT ?`

  return db.prepare(sql).all(serverId, serverId, ...floorK.params, cap)
}

// V Blood hunt tracker — which bosses each player has killed. Returns a map
// { steamId: { charName, bosses: Set of victim GUIDs } }. Respects season resets.
export function getVBloodHuntProgress(serverId = null) {
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  const sql = `
    SELECT steamId,
           MAX(charName) AS charName,
           GROUP_CONCAT(DISTINCT victim) AS bosses
      FROM kill_events
     WHERE kind = 'vblood' AND victim IS NOT NULL
       AND (? IS NULL OR serverId = ?)${floorK.sql}
     GROUP BY steamId`

  const rows = db.prepare(sql).all(serverId, serverId, ...floorK.params)
  return Object.fromEntries(
    rows.map((r) => [
      r.steamId,
      {
        charName: r.charName,
        bosses: new Set(r.bosses ? r.bosses.split(',') : []),
      },
    ]),
  )
}

// Daily activity for a single player — used by the activity heatmap on /p/:steamId.
// Returns an array of { date: 'YYYY-MM-DD', seconds } for the last N days.
// Respects season-reset floors.
export function getPlayerActivity(steamId, days = 365) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return []

  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)

  const since = new Date(Date.now() - days * 864e5).toISOString()
  const sql = `
    SELECT DATE(startedAt) AS date, SUM(seconds) AS seconds
      FROM play_sessions
     WHERE steamId = ? AND startedAt >= ?${floorS.sql}
     GROUP BY DATE(startedAt)
     ORDER BY date ASC`

  return db.prepare(sql).all(steamId, since, ...floorS.params)
}

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
