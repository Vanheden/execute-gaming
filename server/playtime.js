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

// Windows the leaderboard supports: label → cutoff in days (null = all-time).
const PERIODS = { all: null, '30d': 30, '7d': 7 }

// Aggregate playtime per player, most time first. `serverId` null = all servers.
// Returns raw rows (steamId/charName/seconds/…); index.js links them to accounts.
export function getLeaderboard({ serverId = null, period = 'all', limit = 100 } = {}) {
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500)

  return db
    .prepare(
      `SELECT steamId,
              SUM(seconds) AS seconds,
              COUNT(*)     AS sessions,
              MAX(updatedAt) AS lastSeen,
              (SELECT charName FROM play_sessions s2
                 WHERE s2.steamId = s.steamId AND s2.charName IS NOT NULL
                 ORDER BY s2.startedAt DESC LIMIT 1) AS charName
         FROM play_sessions s
        WHERE (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2
        GROUP BY steamId
        HAVING seconds > 0
        ORDER BY seconds DESC, lastSeen DESC
        LIMIT ?3`,
    )
    .all(serverId, since, cap)
}

export const LEADERBOARD_PERIODS = Object.keys(PERIODS)

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
