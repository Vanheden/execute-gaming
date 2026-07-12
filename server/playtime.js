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
import { rankForPoints, RANKS } from '../src/data/ranks.js'

const SERVER_IDS = new Set(servers.map((s) => s.id))
// A single session can't sensibly exceed a few days; cap to reject garbage.
const MAX_SECONDS = 7 * 24 * 3600

const upsertStmt = db.prepare(
  `INSERT INTO play_sessions
     (sessionId, serverId, steamId, charName, clanGuid, clanName, startedAt, endedAt, seconds, updatedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(sessionId) DO UPDATE SET
     charName  = excluded.charName,
     clanGuid  = excluded.clanGuid,
     clanName  = excluded.clanName,
     endedAt   = excluded.endedAt,
     seconds   = excluded.seconds,
     updatedAt = excluded.updatedAt`,
)

// A clan GUID is only meaningful paired with a non-empty name; treat blank/absent
// as "no clan" (clanless players and pre-clan-feature mod versions send neither).
// Returns [guid|null, name|null] — both null unless both are present.
function clanPair(guidRaw, nameRaw) {
  const name = nameRaw ? str(nameRaw, 60) : null
  const guid = guidRaw ? str(guidRaw, 60) : null
  if (!name || !guid) return [null, null]
  return [guid, name]
}

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
  const [clanGuid, clanName] = clanPair(body?.clanGuid, body?.clanName)

  upsertStmt.run(
    sessionId,
    serverId,
    steamId,
    charName,
    clanGuid,
    clanName,
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
     (eventId, serverId, steamId, charName, kind, victim, occurredAt, createdAt,
      clanGuid, clanName, victimClanGuid, victimClanName)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  const [clanGuid, clanName] = clanPair(body?.clanGuid, body?.clanName)
  // Victim clan only applies to PvP kills; ignore it on V Blood events.
  const [victimClanGuid, victimClanName] =
    kind === 'pvp' ? clanPair(body?.victimClanGuid, body?.victimClanName) : [null, null]

  insertKillStmt.run(
    eventId,
    serverId,
    steamId,
    charName,
    kind,
    victim,
    occurredAt,
    new Date().toISOString(),
    clanGuid,
    clanName,
    victimClanGuid,
    victimClanName,
  )

  // Hype highlights: a world-first V Blood kill, or a PvP killstreak crossing a
  // milestone / ending someone else's rampage. The route turns these into the
  // strings the in-game mod broadcasts to all players. Best-effort — a failure
  // here must never fail the ingest, so it's wrapped and defaulted to null.
  let highlights = null
  try {
    highlights = killHighlights({ serverId, steamId, kind, victim, occurredAt })
  } catch (err) {
    highlights = null
  }
  return { ok: true, highlights }
}

// --- Kill highlights (in-game hype broadcasts) ------------------------------
// Computed from the same event history the leaderboard reads, at ingest time, so
// the mod stays a thin forwarder: it POSTs a kill and prints whatever broadcast
// strings the site returns. Everything is season-floored like the rest.
//
// Killstreak ("rampage") tiers: a player's streak is their consecutive PvP kills
// since their last PvP death, inclusive of the kill just recorded. We announce
// when the streak first reaches a tier boundary (3/5/7/10, then every 5 beyond).
// `emoji` is used on the website (where emoji render fine); `color` is a TextMeshPro
// hex used for the in-game chat broadcast, since V Rising's chat font renders <color>
// tags but shows emoji as missing-glyph boxes.
export const RAMPAGE_TIERS = [
  { at: 3, label: 'RAMPAGE', emoji: '🔥', color: '#ff8a3d' },
  { at: 5, label: 'DOMINATING', emoji: '💀', color: '#ff4d63' },
  { at: 7, label: 'UNSTOPPABLE', emoji: '⚡', color: '#b07bff' },
  { at: 10, label: 'GODLIKE', emoji: '👑', color: '#ffd24a' },
]

// The tier a given streak length belongs to (the highest boundary it has reached).
export function rampageTier(streak) {
  let tier = RAMPAGE_TIERS[0]
  for (const t of RAMPAGE_TIERS) if (streak >= t.at) tier = t
  return tier
}

// A streak length is "milestone-worthy" (worth announcing) when it lands exactly on
// a tier boundary, or on every 5th kill once past the top tier.
function isRampageMilestone(streak) {
  if (RAMPAGE_TIERS.some((t) => t.at === streak)) return true
  const top = RAMPAGE_TIERS[RAMPAGE_TIERS.length - 1].at
  return streak > top && streak % 5 === 0
}

// Structured highlight data for one just-recorded kill (or null if none). Shapes:
//   vblood → { kind:'vblood', worldFirst:bool, victim }
//   pvp    → { kind:'pvp', streak, milestone:bool, endedName, endedStreak }
function killHighlights({ serverId, steamId, kind, victim, occurredAt }) {
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  if (kind === 'vblood') {
    if (!victim) return null
    // World-first: no earlier kill of this boss on this server, this season. Strict
    // `<` on the ms-precision timestamp so a retry of this same event (already
    // inserted) still reads as the first — the mod only broadcasts on a fresh
    // response, so that never double-announces.
    const s = `SELECT COUNT(*) AS c FROM kill_events
                 WHERE kind = 'vblood' AND victim = ? AND serverId = ?
                   AND occurredAt < ?${floorK.sql}`
    const prior = db.prepare(s).get(victim, serverId, occurredAt, ...floorK.params).c
    return { kind: 'vblood', worldFirst: prior === 0, victim }
  }

  if (kind === 'pvp') {
    // Killer's current streak: PvP kills since their last death (as a victim),
    // including this kill. Identity is by charName (PvP victims are stored by name).
    const myNames = namesForSteamId(steamId)
    let lastDeathAt = null
    if (myNames.length) {
      const ph = myNames.map(() => '?').join(',')
      let ds = `SELECT MAX(occurredAt) AS m FROM kill_events
                  WHERE kind = 'pvp' AND victim IN (${ph}) AND occurredAt < ?`
      const dp = [...myNames, occurredAt]
      ds += floorK.sql
      dp.push(...floorK.params)
      lastDeathAt = db.prepare(ds).get(...dp).m
    }
    let ks = `SELECT COUNT(*) AS c FROM kill_events
                WHERE kind = 'pvp' AND steamId = ? AND occurredAt <= ?`
    const kp = [steamId, occurredAt]
    if (lastDeathAt) {
      ks += ' AND occurredAt > ?'
      kp.push(lastDeathAt)
    }
    ks += floorK.sql
    kp.push(...floorK.params)
    const streak = db.prepare(ks).get(...kp).c

    // Did this kill end the victim's own rampage? Resolve the victim to a player and
    // count the streak they had going before this death.
    let endedName = null
    let endedStreak = 0
    const victimId = victim ? steamIdForName(victim) : null
    if (victimId && victimId !== steamId) {
      const vNames = namesForSteamId(victimId)
      let prevDeathAt = null
      if (vNames.length) {
        const ph = vNames.map(() => '?').join(',')
        let ps = `SELECT MAX(occurredAt) AS m FROM kill_events
                    WHERE kind = 'pvp' AND victim IN (${ph}) AND occurredAt < ?`
        const pp = [...vNames, occurredAt]
        ps += floorK.sql
        pp.push(...floorK.params)
        prevDeathAt = db.prepare(ps).get(...pp).m
      }
      let vs = `SELECT COUNT(*) AS c FROM kill_events
                  WHERE kind = 'pvp' AND steamId = ? AND occurredAt < ?`
      const vp = [victimId, occurredAt]
      if (prevDeathAt) {
        vs += ' AND occurredAt > ?'
        vp.push(prevDeathAt)
      }
      vs += floorK.sql
      vp.push(...floorK.params)
      endedStreak = db.prepare(vs).get(...vp).c
      endedName = victim
    }

    return { kind: 'pvp', streak, milestone: isRampageMilestone(streak), endedName, endedStreak }
  }

  return null
}

// --- Castle raids -----------------------------------------------------------
// One event per raid (a player raiding another player's/clan's castle heart),
// keyed by a mod-issued eventId (INSERT OR IGNORE, so retries can't double count).
// Either side's identity may be partial: a clanless solo raider has no attacker
// clan, and an unresolved owner has no defender identity. We keep whatever resolves.
const RAID_KINDS = new Set(['raid'])

const insertRaidStmt = db.prepare(
  `INSERT OR IGNORE INTO raid_events
     (eventId, serverId, kind, attackerSteamId, attackerName, attackerClanGuid,
      attackerClanName, defenderSteamId, defenderName, defenderClanGuid,
      defenderClanName, occurredAt, createdAt)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
)

// A SteamID64 is a 17-digit number; accept as string to avoid precision loss. Blank
// or malformed → null (the raid is still recorded, attributed by clan instead).
function steamIdOrNull(v) {
  const s = v ? str(v, 20) : null
  return s && /^\d{5,20}$/.test(s) ? s : null
}

// Validate + record one raid event from the mod. Returns { ok } or { error }.
export function recordRaid(body) {
  const eventId = str(body?.eventId, 100)
  if (!eventId) return { error: 'eventId required' }

  const serverId = str(body?.serverId, 60)
  if (!serverId || !SERVER_IDS.has(serverId)) return { error: 'unknown serverId' }

  const kind = str(body?.kind, 20) || 'raid'
  if (!RAID_KINDS.has(kind)) return { error: 'invalid kind' }

  const occurredAt = isoOrNull(body?.occurredAt)
  if (!occurredAt) return { error: 'invalid occurredAt' }

  const attackerSteamId = steamIdOrNull(body?.attackerSteamId)
  const defenderSteamId = steamIdOrNull(body?.defenderSteamId)
  const attackerName = body?.attackerName ? str(body.attackerName, 60) : null
  const defenderName = body?.defenderName ? str(body.defenderName, 60) : null
  const [attackerClanGuid, attackerClanName] = clanPair(body?.attackerClanGuid, body?.attackerClanName)
  const [defenderClanGuid, defenderClanName] = clanPair(body?.defenderClanGuid, body?.defenderClanName)

  // Reject a raid with no identifiable participant on either side (nothing to show).
  if (!attackerSteamId && !defenderSteamId && !attackerClanGuid && !defenderClanGuid) {
    return { error: 'no participants' }
  }

  insertRaidStmt.run(
    eventId,
    serverId,
    kind,
    attackerSteamId,
    attackerName,
    attackerClanGuid,
    attackerClanName,
    defenderSteamId,
    defenderName,
    defenderClanGuid,
    defenderClanName,
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

// Per-player "home server": the server each SteamID has logged the most playtime
// on, within the given `period` and respecting season-reset floors. Returns a map
// { steamId: { serverId, seconds, total, servers } } where `seconds` is the time on
// the home server, `total` is across all servers, and `servers` is how many
// distinct servers they've played. Only meaningful for the all-servers view (when a
// single server is selected every player's home is trivially that server). Players
// with no sessions in-window are omitted.
export function topServers(steamIds, period = 'all') {
  const ids = [...new Set((steamIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const floor = resetFloorAnon('startedAt', Object.entries(getLeaderboardResets()))
  const placeholders = ids.map(() => '?').join(',')

  const rows = db
    .prepare(
      `SELECT steamId, serverId, SUM(seconds) AS seconds
         FROM play_sessions
        WHERE steamId IN (${placeholders}) AND startedAt >= ?${floor.sql}
        GROUP BY steamId, serverId`,
    )
    .all(...ids, since, ...floor.params)

  // Reduce to the top server per player (plus totals) in one pass.
  const out = {}
  for (const r of rows) {
    const cur = out[r.steamId] || (out[r.steamId] = { serverId: null, seconds: 0, total: 0, servers: 0 })
    cur.total += r.seconds
    cur.servers += 1
    if (r.seconds > cur.seconds) {
      cur.seconds = r.seconds
      cur.serverId = r.serverId
    }
  }
  return out
}

// Total playtime (seconds) per server, summed across the given SteamIDs, within
// `period` and respecting season-reset floors. Returns a plain map
// { serverId: seconds }. Used for the per-server playtime split on profiles (a
// member may have several linked SteamIDs). Servers with no time are omitted.
export function serverPlaytime(steamIds, period = 'all') {
  const ids = [...new Set((steamIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const floor = resetFloorAnon('startedAt', Object.entries(getLeaderboardResets()))
  const placeholders = ids.map(() => '?').join(',')

  const rows = db
    .prepare(
      `SELECT serverId, SUM(seconds) AS seconds
         FROM play_sessions
        WHERE steamId IN (${placeholders}) AND startedAt >= ?${floor.sql}
        GROUP BY serverId`,
    )
    .all(...ids, since, ...floor.params)

  return Object.fromEntries(rows.filter((r) => r.seconds > 0).map((r) => [r.serverId, r.seconds]))
}

// --- Rank-up detection (for the Discord webhook) ---------------------------
// Called after every session/kill ingest. Recomputes the player's GLOBAL all-time
// rank tier and compares it to the highest tier we've recorded for them. The first
// time we ever see a SteamID we seed its current tier *silently* (returns null), so
// enabling this feature never announces ranks players already held. Afterwards we
// only fire when the tier actually increases; a season reset that lowers points
// just lowers the stored tier silently (no "rank up"). Returns
// `{ from, to, tier, points }` on a genuine promotion, otherwise null.
const rankRowStmt = db.prepare('SELECT tierIndex FROM player_ranks WHERE steamId = ?')
const rankUpsertStmt = db.prepare(
  `INSERT INTO player_ranks (steamId, tierIndex, updatedAt) VALUES (?, ?, ?)
   ON CONFLICT(steamId) DO UPDATE SET tierIndex = excluded.tierIndex, updatedAt = excluded.updatedAt`,
)

export function checkRankPromotion(steamId) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return null
  const points = allTimePoints([steamId], null)[steamId] ?? 0
  const { index } = rankForPoints(points)
  const prev = rankRowStmt.get(steamId)

  // First sighting: remember where they stand, announce nothing.
  if (!prev) {
    rankUpsertStmt.run(steamId, index, new Date().toISOString())
    return null
  }
  if (index === prev.tierIndex) return null

  // Persist the new position either way; only an upward move is a "promotion".
  rankUpsertStmt.run(steamId, index, new Date().toISOString())
  if (index < prev.tierIndex) return null
  return { from: prev.tierIndex, to: index, tier: RANKS[index], points }
}

// --- Community milestone detection (for the Discord webhook) ---------------
// Watches the cumulative community totals (from getGlobalStats) and returns the
// round thresholds newly crossed since we last checked. Like ranks, each metric
// is seeded SILENTLY on first run (so enabling the webhook never announces a
// milestone already passed), and we store a high-water mark so a season reset
// that lowers the running total never re-announces the same milestone.
const MILESTONES = {
  hours: {
    thresholds: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000],
    emoji: '⏳',
    label: (v) => `${v.toLocaleString()} hours played together`,
  },
  vblood: {
    thresholds: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
    emoji: '🩸',
    label: (v) => `${v.toLocaleString()} V Bloods felled`,
  },
  pvp: {
    thresholds: [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000],
    emoji: '⚔️',
    label: (v) => `${v.toLocaleString()} PvP kills landed`,
  },
}
const msReadStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const msWriteStmt = db.prepare(
  `INSERT INTO settings (key, value) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
)

function highestCrossed(thresholds, value) {
  let hit = 0
  for (const t of thresholds) if (value >= t) hit = t
  return hit
}

export function checkMilestones() {
  const stats = getGlobalStats()
  const values = {
    hours: Math.floor((stats.seconds || 0) / 3600),
    vblood: stats.vblood || 0,
    pvp: stats.pvp || 0,
  }
  const crossed = []
  for (const [metric, cfg] of Object.entries(MILESTONES)) {
    const current = highestCrossed(cfg.thresholds, values[metric])
    const key = `milestone_${metric}`
    const row = msReadStmt.get(key)
    if (!row?.value) {
      msWriteStmt.run(key, JSON.stringify(current)) // seed silently
      continue
    }
    let prev = 0
    try {
      prev = JSON.parse(row.value)
    } catch {
      prev = 0
    }
    if (current > prev) {
      msWriteStmt.run(key, JSON.stringify(current))
      crossed.push({ metric, value: current, label: cfg.label(current), emoji: cfg.emoji })
    }
  }
  return crossed
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

// Cosmetic "archetype" flavour for the shareable recap card — whichever pursuit
// dominates a player's season decides their title. Purely for fun/branding.
const RECAP_ARCHETYPES = {
  raider: { title: 'Castle Breaker', icon: '🏰', blurb: 'Walls mean nothing to them.' },
  duelist: { title: 'Bloodletter', icon: '⚔️', blurb: 'Death follows their blade.' },
  hunter: { title: 'V Blood Hunter', icon: '🩸', blurb: 'A collector of legends.' },
  nightwalker: { title: 'Nightwalker', icon: '🌙', blurb: 'The night belongs to them.' },
}

// Assemble a shareable "season recap" for one player — the numbers behind the
// downloadable card on /p/:steamId and /u/:key. Everything is season-floored so a
// server wipe resets it too, matching the leaderboard. Returns null for players
// with no tracked activity.
export function getPlayerRecap(steamId) {
  const stats = getPlayerStats(steamId)
  if (!stats) return null

  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  // Distinct V Blood bosses felled (drives the "hunter" archetype + a card stat).
  const vbloodDistinct = db
    .prepare(
      `SELECT COUNT(DISTINCT victim) AS c FROM kill_events
         WHERE steamId = ? AND kind = 'vblood' AND victim IS NOT NULL${floorK.sql}`,
    )
    .get(steamId, ...floorK.params).c

  // Raids landed as the attacker (event-sourced on raid_events, same season floor).
  const raids = db
    .prepare(`SELECT COUNT(*) AS c FROM raid_events WHERE attackerSteamId = ?${floorK.sql}`)
    .get(steamId, ...floorK.params).c

  // Global rank position by points. The community is small, so the 500 cap on the
  // board is plenty to place everyone who has earned a single point.
  const board = getLeaderboard({ metric: 'points', limit: 500 })
  const idx = board.findIndex((r) => r.steamId === steamId)
  const rank = idx >= 0 ? idx + 1 : null
  const totalRanked = board.length
  const percentile =
    rank && totalRanked ? Math.max(1, Math.round((rank / totalRanked) * 100)) : null

  // Top nemesis (whoever killed them most this season) for the card's rivalry line.
  const { nemeses } = getRivalries(steamId, 1)
  const nemesis = nemeses[0]
    ? { name: nemeses[0].charName, kills: nemeses[0].kills, revenge: nemeses[0].revenge }
    : null

  // Archetype: whichever pursuit dominates, by a simple weighted share of the
  // headline stats. Weights just balance the scales (raids are rare, hours common).
  const hours = stats.seconds / 3600
  const scores = {
    raider: raids * 8,
    duelist: stats.pvp * 2,
    hunter: vbloodDistinct * 3,
    nightwalker: hours,
  }
  const [topKey, topScore] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  const archetype =
    topScore > 0
      ? RECAP_ARCHETYPES[topKey]
      : { title: 'Fledgling Vampire', icon: '🦇', blurb: 'The story is just beginning.' }

  // Season label from the most recent reset cutoff, if any is set.
  const resets = Object.values(getLeaderboardResets())
  const seasonStart = resets.length ? resets.slice().sort().slice(-1)[0] : null

  return {
    steamId: stats.steamId,
    charName: stats.charName,
    seconds: stats.seconds,
    hours: Math.round(hours),
    sessions: stats.sessions,
    vblood: stats.vblood,
    vbloodDistinct,
    pvp: stats.pvp,
    raids,
    points: stats.points,
    rank,
    totalRanked,
    percentile,
    nemesis,
    archetype,
    seasonStart,
    generatedAt: new Date().toISOString(),
  }
}

// Recent kill events for the live kill feed. Returns the latest N kills across
// all servers (or one server), newest first. Each row: { steamId, charName, kind,
// victim, occurredAt, serverId }. Respects season-reset floors.
export function getRecentKills(serverId = null, limit = 20, kind = null) {
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorK = resetFloorAnon('occurredAt', resetEntries)
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const kindFilter = kind === 'pvp' || kind === 'vblood' ? kind : null

  const sql = `
    SELECT steamId, charName, kind, victim, occurredAt, serverId
      FROM kill_events
     WHERE (? IS NULL OR serverId = ?)
       AND (? IS NULL OR kind = ?)${floorK.sql}
     ORDER BY occurredAt DESC
     LIMIT ?`

  return db.prepare(sql).all(serverId, serverId, kindFilter, kindFilter, ...floorK.params, cap)
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

// Weekly highlights — top players in the last 7 days across categories.
// Returns { topPlaytime, topVBlood, topPvp, topPoints } — each an array of
// { steamId, charName, value } (1 entry or empty). Respects season resets.
export function getWeeklyHighlights() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString()
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  function topQuery(sql, params) {
    const row = db.prepare(sql).get(...params)
    if (!row) return null
    return { steamId: row.steamId, charName: row.charName, value: row.value }
  }

  const playtimeSql = `
    SELECT steamId, MAX(charName) AS charName, SUM(seconds) AS value
      FROM play_sessions
     WHERE startedAt >= ?${floorS.sql}
     GROUP BY steamId ORDER BY value DESC LIMIT 1`

  const vbloodSql = `
    SELECT steamId, MAX(charName) AS charName, COUNT(*) AS value
      FROM kill_events
     WHERE kind = 'vblood' AND occurredAt >= ?${floorK.sql}
     GROUP BY steamId ORDER BY value DESC LIMIT 1`

  const pvpSql = `
    SELECT steamId, MAX(charName) AS charName, COUNT(*) AS value
      FROM kill_events
     WHERE kind = 'pvp' AND occurredAt >= ?${floorK.sql}
     GROUP BY steamId ORDER BY value DESC LIMIT 1`

  const pointsSql = `
    SELECT ids.steamId AS steamId,
           (SELECT charName FROM (
              SELECT charName, startedAt AS t FROM play_sessions
                WHERE steamId = ids.steamId AND charName IS NOT NULL
              UNION ALL
              SELECT charName, occurredAt AS t FROM kill_events
                WHERE steamId = ids.steamId AND charName IS NOT NULL
            ) ORDER BY t DESC LIMIT 1) AS charName,
           CAST(
             COALESCE(p.seconds, 0) / 3600.0 * ?
             + COALESCE(k.vbloodDistinct, 0) * ?
             + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
             + COALESCE(k.pvp, 0) * ?
           AS INTEGER) AS value
    FROM (
      SELECT steamId FROM play_sessions WHERE startedAt >= ?${floorS.sql}
      UNION
      SELECT steamId FROM kill_events WHERE occurredAt >= ?${floorK.sql}
    ) ids
    LEFT JOIN (
      SELECT steamId, SUM(seconds) AS seconds FROM play_sessions
       WHERE startedAt >= ?${floorS.sql} GROUP BY steamId
    ) p ON p.steamId = ids.steamId
    LEFT JOIN (
      SELECT steamId,
             SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
             COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                 THEN victim END)              AS vbloodDistinct,
             SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp
        FROM kill_events
       WHERE occurredAt >= ?${floorK.sql} GROUP BY steamId
    ) k ON k.steamId = ids.steamId
    ORDER BY value DESC LIMIT 1`

  return {
    topPlaytime: topQuery(playtimeSql, [since, ...floorS.params]),
    topVBlood: topQuery(vbloodSql, [since, ...floorK.params]),
    topPvp: topQuery(pvpSql, [since, ...floorK.params]),
    topPoints: topQuery(pointsSql, [
      POINTS.perHour, POINTS.perVBloodFirst, POINTS.perVBloodRepeat, POINTS.perPvpKill,
      since, ...floorS.params,
      since, ...floorK.params,
      since, ...floorS.params,
      since, ...floorK.params,
    ]),
  }
}

// Search players by charName across all tracked activity (registered + guests).
// Returns an array of { steamId, charName, seconds, vblood, pvp, points, lastSeen }
// sorted by points desc. `query` is a substring match on charName (case-insensitive).
export function searchPlayers(query, limit = 20) {
  const q = String(query || '').trim()
  if (q.length < 2) return []
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

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
           MAX(COALESCE(p.lastSeen, '0'), COALESCE(k.lastKill, '0')) AS lastSeen,
           (SELECT charName FROM (
              SELECT charName, startedAt AS t FROM play_sessions
                WHERE steamId = ids.steamId AND charName IS NOT NULL
              UNION ALL
              SELECT charName, occurredAt AS t FROM kill_events
                WHERE steamId = ids.steamId AND charName IS NOT NULL
            ) ORDER BY t DESC LIMIT 1) AS charName
    FROM (
      SELECT DISTINCT steamId FROM play_sessions
       WHERE charName LIKE ?${floorS.sql}
      UNION
      SELECT DISTINCT steamId FROM kill_events
       WHERE charName LIKE ?${floorK.sql}
    ) ids
    LEFT JOIN (
      SELECT steamId, SUM(seconds) AS seconds, MAX(updatedAt) AS lastSeen
        FROM play_sessions${floorS.sql} GROUP BY steamId
    ) p ON p.steamId = ids.steamId
    LEFT JOIN (
      SELECT steamId,
             SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
             COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                 THEN victim END)              AS vbloodDistinct,
             SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp,
             MAX(occurredAt) AS lastKill
        FROM kill_events${floorK.sql} GROUP BY steamId
    ) k ON k.steamId = ids.steamId
    WHERE charName IS NOT NULL
    ORDER BY points DESC
    LIMIT ?`

  const pattern = `%${q}%`
  return db.prepare(sql).all(
    POINTS.perHour, POINTS.perVBloodFirst, POINTS.perVBloodRepeat, POINTS.perPvpKill,
    pattern, ...floorS.params,
    pattern, ...floorK.params,
    ...floorS.params,
    ...floorK.params,
    cap,
  )
}

// --- Global milestones -----------------------------------------------------
// Community-wide totals for the "milestones" strip on the leaderboard page.
// Respects season-reset floors so wiped activity drops out. Returns
// { seconds, sessions, players, vblood, pvp, distinctBosses }.
export function getGlobalStats() {
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  const p = db
    .prepare(
      `SELECT COALESCE(SUM(seconds), 0) AS seconds, COUNT(*) AS sessions,
              COUNT(DISTINCT steamId) AS players
         FROM play_sessions WHERE 1=1${floorS.sql}`,
    )
    .get(...floorS.params)
  const k = db
    .prepare(
      `SELECT SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
              SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp,
              COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                  THEN victim END)              AS distinctBosses
         FROM kill_events WHERE 1=1${floorK.sql}`,
    )
    .get(...floorK.params)
  const r = db
    .prepare(`SELECT COUNT(*) AS raids FROM raid_events WHERE 1=1${floorK.sql}`)
    .get(...floorK.params)

  return {
    seconds: p.seconds || 0,
    sessions: p.sessions || 0,
    players: p.players || 0,
    vblood: k.vblood || 0,
    pvp: k.pvp || 0,
    distinctBosses: k.distinctBosses || 0,
    raids: r.raids || 0,
  }
}

// --- Rivalries (from PvP kills) ---------------------------------------------
// PvP kill events store the killer's steamId and the victim's *charName*. So a
// player's "nemeses" (deaths where they're the victim) resolve to real killer
// steamIds directly, while their "prey" (kills where they're the killer) are
// grouped by the victim's name and resolved to a steamId for linking.

// Every charName a steamId has ever used (to match them as a PvP victim).
function namesForSteamId(steamId) {
  return db
    .prepare(
      `SELECT DISTINCT charName FROM (
         SELECT charName FROM play_sessions WHERE steamId = ? AND charName IS NOT NULL
         UNION SELECT charName FROM kill_events WHERE steamId = ? AND charName IS NOT NULL
       )`,
    )
    .all(steamId, steamId)
    .map((r) => r.charName)
}

// Most-recent steamId that used a given charName (for linking prey to a profile).
function steamIdForName(name) {
  const row = db
    .prepare(
      `SELECT steamId FROM (
         SELECT steamId, startedAt AS t FROM play_sessions WHERE charName = ?
         UNION ALL SELECT steamId, occurredAt AS t FROM kill_events WHERE charName = ?
       ) ORDER BY t DESC LIMIT 1`,
    )
    .get(name, name)
  return row?.steamId || null
}

// Top nemeses + prey for a player. Each nemesis carries `kills` (times they killed
// you) and `revenge` (times you killed them back) for a head-to-head record.
export function getRivalries(steamId, limit = 5) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return { nemeses: [], prey: [] }
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 20)
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  const myNames = namesForSteamId(steamId)

  // Nemeses: PvP deaths where I'm the victim, grouped by the killer's steamId.
  let nemeses = []
  if (myNames.length) {
    const ph = myNames.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT steamId AS steamId, MAX(charName) AS charName, COUNT(*) AS kills
           FROM kill_events
          WHERE kind = 'pvp' AND steamId != ? AND victim IN (${ph})${floorK.sql}
          GROUP BY steamId ORDER BY kills DESC, MAX(occurredAt) DESC LIMIT ?`,
      )
      .all(steamId, ...myNames, ...floorK.params, cap)

    nemeses = rows.map((n) => {
      // Head-to-head: how many times I killed this nemesis back.
      const theirNames = namesForSteamId(n.steamId)
      let revenge = 0
      if (theirNames.length) {
        const ph2 = theirNames.map(() => '?').join(',')
        revenge = db
          .prepare(
            `SELECT COUNT(*) AS c FROM kill_events
              WHERE kind = 'pvp' AND steamId = ? AND victim IN (${ph2})${floorK.sql}`,
          )
          .get(steamId, ...theirNames, ...floorK.params).c
      }
      return { steamId: n.steamId, charName: n.charName, kills: n.kills, revenge }
    })
  }

  // Prey: PvP kills where I'm the killer, grouped by the victim's name.
  const preyRows = db
    .prepare(
      `SELECT victim AS name, COUNT(*) AS kills, MAX(occurredAt) AS last
         FROM kill_events
        WHERE kind = 'pvp' AND steamId = ? AND victim IS NOT NULL${floorK.sql}
        GROUP BY victim ORDER BY kills DESC, last DESC LIMIT ?`,
    )
    .all(steamId, ...floorK.params, cap)

  const prey = preyRows.map((r) => ({
    steamId: steamIdForName(r.name),
    charName: r.name,
    kills: r.kills,
  }))

  return { nemeses, prey }
}

// The single most one-sided PvP rivalry across all players, for the milestones
// strip. Returns { killer, victim, kills } or null (needs at least 2 kills).
export function getHottestFeud() {
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))
  const row = db
    .prepare(
      `SELECT steamId, victim, COUNT(*) AS kills, MAX(occurredAt) AS last
         FROM kill_events
        WHERE kind = 'pvp' AND victim IS NOT NULL${floorK.sql}
        GROUP BY steamId, victim ORDER BY kills DESC, last DESC LIMIT 1`,
    )
    .get(...floorK.params)
  if (!row || row.kills < 2) return null

  const killerName =
    db
      .prepare(
        `SELECT charName FROM (
           SELECT charName, startedAt AS t FROM play_sessions
             WHERE steamId = ? AND charName IS NOT NULL
           UNION ALL SELECT charName, occurredAt AS t FROM kill_events
             WHERE steamId = ? AND charName IS NOT NULL
         ) ORDER BY t DESC LIMIT 1`,
      )
      .get(row.steamId, row.steamId)?.charName || null

  return {
    killer: { steamId: row.steamId, charName: killerName },
    victim: { steamId: steamIdForName(row.victim), charName: row.victim },
    kills: row.kills,
  }
}

// --- PvP rating (Elo) --------------------------------------------------------
// A skill rating derived from PvP kills treated as a sequence of 1v1 "matches"
// (the killer wins, the victim loses), replayed in chronological order. Both
// fighters must resolve to a known SteamID — anonymous victims can't be rated.
// Season-floored like the rest, and memoised so profile/leaderboard hits don't
// replay the whole history unless a new PvP kill has landed.
const ELO_START = 1000
const ELO_K = 32
const ELO_MIN_MATCHES = 3 // below this a player is "provisional" and hidden from the board

let eloMemo = { sig: null, data: null }

function computeElo() {
  const resets = getLeaderboardResets()
  const floorK = resetFloorAnon('occurredAt', Object.entries(resets))

  // Cheap cache signature: reuse the last result unless the PvP kill count, the
  // newest kill timestamp, or the season resets have changed.
  const sig = db
    .prepare(`SELECT COUNT(*) AS c, MAX(occurredAt) AS m FROM kill_events WHERE kind = 'pvp'${floorK.sql}`)
    .get(...floorK.params)
  const sigKey = `${sig.c}|${sig.m}|${JSON.stringify(resets)}`
  if (eloMemo.sig === sigKey) return eloMemo.data

  // Identity maps. Each MAX(t) row carries its own bare columns (SQLite's
  // documented min/max bare-column rule), so we get the most-recent name per
  // SteamID and the most-recent SteamID per name in a single grouped scan.
  const identitySql = `
    SELECT steamId, charName, MAX(t) AS t FROM (
      SELECT steamId, charName, startedAt AS t FROM play_sessions
        WHERE steamId IS NOT NULL AND charName IS NOT NULL
      UNION ALL
      SELECT steamId, charName, occurredAt AS t FROM kill_events
        WHERE steamId IS NOT NULL AND charName IS NOT NULL
    ) GROUP BY `
  const idToName = new Map(
    db.prepare(identitySql + 'steamId').all().map((r) => [r.steamId, r.charName]),
  )
  const nameToId = new Map(
    db.prepare(identitySql + 'charName').all().map((r) => [r.charName, r.steamId]),
  )

  const kills = db
    .prepare(
      `SELECT steamId AS killer, victim FROM kill_events
         WHERE kind = 'pvp' AND victim IS NOT NULL AND steamId IS NOT NULL${floorK.sql}
         ORDER BY occurredAt ASC, rowid ASC`,
    )
    .all(...floorK.params)

  const R = new Map() // steamId -> current rating
  const stat = new Map() // steamId -> { wins, losses, matches, peak }
  const get = (id) => (R.has(id) ? R.get(id) : ELO_START)
  const st = (id) => {
    let s = stat.get(id)
    if (!s) stat.set(id, (s = { wins: 0, losses: 0, matches: 0, peak: ELO_START }))
    return s
  }

  for (const k of kills) {
    const a = k.killer
    const b = nameToId.get(k.victim)
    if (!b || a === b) continue // unrateable / self-kill
    const Ra = get(a)
    const Rb = get(b)
    const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400))
    const delta = ELO_K * (1 - Ea) // winner gains this, loser sheds it
    R.set(a, Ra + delta)
    R.set(b, Rb - delta)
    const sa = st(a)
    const sb = st(b)
    sa.wins++
    sa.matches++
    if (Ra + delta > sa.peak) sa.peak = Ra + delta
    sb.losses++
    sb.matches++
  }

  const players = [...R.entries()]
    .map(([id, rating]) => {
      const s = stat.get(id)
      return {
        steamId: id,
        charName: idToName.get(id) || null,
        rating: Math.round(rating),
        wins: s.wins,
        losses: s.losses,
        matches: s.matches,
        peak: Math.round(s.peak),
        provisional: s.matches < ELO_MIN_MATCHES,
      }
    })
    .sort((x, y) => y.rating - x.rating || y.matches - x.matches)

  eloMemo = { sig: sigKey, data: players }
  return players
}

// Ranked PvP ladder — established (non-provisional) fighters, best rating first.
export function getPvpLeaderboard(limit = 50) {
  const cap = Math.min(Math.max(Number(limit) || 50, 1), 200)
  return computeElo()
    .filter((p) => !p.provisional)
    .slice(0, cap)
}

// One player's PvP rating + ladder position. Returns null if they've never had a
// rateable PvP fight this season. `rank`/`totalRated` reflect the established
// ladder; a provisional fighter carries a rating but no rank yet.
export function getPvpRating(steamId) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return null
  const all = computeElo()
  const me = all.find((p) => p.steamId === steamId)
  if (!me) return null
  const ranked = all.filter((p) => !p.provisional)
  const idx = me.provisional ? -1 : ranked.findIndex((p) => p.steamId === steamId)
  return { ...me, rank: idx >= 0 ? idx + 1 : null, totalRated: ranked.length }
}

// --- Server records: world-first V Blood kills ------------------------------
// The first player to fell each V Blood boss on a server, this season (season-
// floored so a wipe restarts the race). Powers the "Hall of Fame" on the hunt
// tracker and the in-game world-first broadcast (same `occurredAt < now` rule).
// index.js resolves the boss PrefabGUID to a display name. Newest conquest first.
export function getServerRecords(serverId = null, limit = 100) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 200)
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  // ROW_NUMBER picks the earliest kill of each (server, boss); rn=1 is the record.
  const sql = `
    SELECT victim, serverId, steamId, charName, occurredAt FROM (
      SELECT victim, serverId, steamId, charName, occurredAt,
             ROW_NUMBER() OVER (PARTITION BY serverId, victim
                                ORDER BY occurredAt ASC, rowid ASC) AS rn
        FROM kill_events
       WHERE kind = 'vblood' AND victim IS NOT NULL
         AND (? IS NULL OR serverId = ?)${floorK.sql}
    )
    WHERE rn = 1
    ORDER BY occurredAt DESC
    LIMIT ?`

  return db.prepare(sql).all(serverId, serverId, ...floorK.params, cap)
}

// --- Rampages (biggest PvP killstreaks) -------------------------------------
// Replays PvP kills chronologically, tracking each player's running streak (reset
// when they die to another player) and their peak. Season-floored and memoised on
// the same cheap signature as the Elo ladder. Powers the rampage board on /pvp.

// Most-recent name↔SteamID maps across all tracked activity (SQLite's min/max
// bare-column rule gives the newest row per group in one scan). Shared by the
// rampage replay; the Elo engine builds its own inline copy.
function pvpIdentityMaps() {
  const identitySql = `
    SELECT steamId, charName, MAX(t) AS t FROM (
      SELECT steamId, charName, startedAt AS t FROM play_sessions
        WHERE steamId IS NOT NULL AND charName IS NOT NULL
      UNION ALL
      SELECT steamId, charName, occurredAt AS t FROM kill_events
        WHERE steamId IS NOT NULL AND charName IS NOT NULL
    ) GROUP BY `
  const idToName = new Map(
    db.prepare(identitySql + 'steamId').all().map((r) => [r.steamId, r.charName]),
  )
  const nameToId = new Map(
    db.prepare(identitySql + 'charName').all().map((r) => [r.charName, r.steamId]),
  )
  return { idToName, nameToId }
}

let rampageMemo = { sig: null, data: null }

function computeRampages() {
  const resets = getLeaderboardResets()
  const floorK = resetFloorAnon('occurredAt', Object.entries(resets))

  const sig = db
    .prepare(`SELECT COUNT(*) AS c, MAX(occurredAt) AS m FROM kill_events WHERE kind = 'pvp'${floorK.sql}`)
    .get(...floorK.params)
  const sigKey = `${sig.c}|${sig.m}|${JSON.stringify(resets)}`
  if (rampageMemo.sig === sigKey) return rampageMemo.data

  const { idToName, nameToId } = pvpIdentityMaps()
  const kills = db
    .prepare(
      `SELECT steamId AS killer, victim FROM kill_events
         WHERE kind = 'pvp' AND victim IS NOT NULL AND steamId IS NOT NULL${floorK.sql}
         ORDER BY occurredAt ASC, rowid ASC`,
    )
    .all(...floorK.params)

  const cur = new Map() // steamId -> current streak
  const peak = new Map() // steamId -> best streak this season
  for (const k of kills) {
    const a = k.killer
    const s = (cur.get(a) || 0) + 1
    cur.set(a, s)
    if (s > (peak.get(a) || 0)) peak.set(a, s)
    // The victim's streak (if we can identify them) is broken by this death.
    const b = nameToId.get(k.victim)
    if (b) cur.set(b, 0)
  }

  const out = [...peak.entries()]
    .map(([id, best]) => ({
      steamId: id,
      charName: idToName.get(id) || null,
      peak: best,
      current: cur.get(id) || 0,
    }))
    .filter((p) => p.peak >= 2) // a "streak" needs at least 2 kills
    .sort((a, b) => b.peak - a.peak || b.current - a.current)

  rampageMemo = { sig: sigKey, data: out }
  return out
}

// Top PvP killstreaks this season, best peak first. Each row carries `peak` (their
// best streak) and `current` (their live streak as of the last kill).
export function getTopRampages(limit = 10) {
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 50)
  return computeRampages().slice(0, cap)
}

// --- Clans -----------------------------------------------------------------
// Clan attribution is denormalised at event time (clanGuid + clanName on each
// session/kill). A clan is keyed by its stable ClanGuid (rename-proof) and shown
// under its LATEST captured name. All clan stats reuse the same POINTS weighting
// and season-reset floors as the player leaderboard, recomputed from raw rows.

// Latest captured display name for a clanGuid (across sessions + kills), newest wins.
function clanNameForGuid(clanGuid) {
  const row = db
    .prepare(
      `SELECT clanName FROM (
         SELECT clanName, startedAt AS t FROM play_sessions
           WHERE clanGuid = ? AND clanName IS NOT NULL
         UNION ALL
         SELECT clanName, occurredAt AS t FROM kill_events
           WHERE clanGuid = ? AND clanName IS NOT NULL
         UNION ALL
         SELECT attackerClanName, occurredAt AS t FROM raid_events
           WHERE attackerClanGuid = ? AND attackerClanName IS NOT NULL
         UNION ALL
         SELECT defenderClanName, occurredAt AS t FROM raid_events
           WHERE defenderClanGuid = ? AND defenderClanName IS NOT NULL
       ) ORDER BY t DESC LIMIT 1`,
    )
    .get(clanGuid, clanGuid, clanGuid, clanGuid)
  return row?.clanName || null
}

// Clan leaderboard: one row per clan (serverId + clanGuid), every metric attached
// so the UI can show a breakdown. `metric` (points|playtime|vblood|pvp) picks the
// sort. `serverId` null = all servers. Clans are per-server, so grouping by clanGuid
// keeps them distinct even in the all-servers view.
export function getClanLeaderboard({ serverId = null, period = 'all', metric = 'points', limit = 100 } = {}) {
  const col = METRICS[metric] ?? METRICS.points
  const days = PERIODS[period] ?? null
  const since = days ? new Date(Date.now() - days * 864e5).toISOString() : '0'
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500)

  const resetEntries = Object.entries(getLeaderboardResets())
  const resetParams = resetEntries.map(([, iso]) => iso)
  const floorS = resetFloorSql('startedAt', resetEntries, 8)
  const floorK = resetFloorSql('occurredAt', resetEntries, 8)

  const sql = `
    SELECT * FROM (
      SELECT ids.clanGuid AS clanGuid,
             COALESCE(p.serverId, k.serverId) AS serverId,
             COALESCE(p.seconds, 0)  AS seconds,
             COALESCE(p.members, 0)  AS members,
             COALESCE(k.vblood, 0)   AS vblood,
             COALESCE(k.pvp, 0)      AS pvp,
             MAX(COALESCE(p.lastSeen, '0'), COALESCE(k.lastKill, '0')) AS lastSeen,
             CAST(
               COALESCE(p.seconds, 0) / 3600.0 * ?3
               + COALESCE(k.vbloodDistinct, 0) * ?4
               + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?5
               + COALESCE(k.pvp, 0) * ?6
             AS INTEGER) AS points
        FROM (
          SELECT DISTINCT clanGuid FROM play_sessions
            WHERE clanGuid IS NOT NULL AND (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2${floorS}
          UNION
          SELECT DISTINCT clanGuid FROM kill_events
            WHERE clanGuid IS NOT NULL AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
        ) ids
        LEFT JOIN (
          SELECT clanGuid, MAX(serverId) AS serverId, SUM(seconds) AS seconds,
                 COUNT(DISTINCT steamId) AS members, MAX(updatedAt) AS lastSeen
            FROM play_sessions
           WHERE clanGuid IS NOT NULL AND (?1 IS NULL OR serverId = ?1) AND startedAt >= ?2${floorS}
           GROUP BY clanGuid
        ) p ON p.clanGuid = ids.clanGuid
        LEFT JOIN (
          SELECT clanGuid, MAX(serverId) AS serverId,
                 SUM(CASE WHEN kind = 'vblood' THEN 1 ELSE 0 END) AS vblood,
                 COUNT(DISTINCT CASE WHEN kind = 'vblood' AND victim IS NOT NULL
                                     THEN victim END)              AS vbloodDistinct,
                 SUM(CASE WHEN kind = 'pvp' THEN 1 ELSE 0 END)    AS pvp,
                 MAX(occurredAt) AS lastKill
            FROM kill_events
           WHERE clanGuid IS NOT NULL AND (?1 IS NULL OR serverId = ?1) AND occurredAt >= ?2${floorK}
           GROUP BY clanGuid
        ) k ON k.clanGuid = ids.clanGuid
    )
    WHERE ${col} > 0
    ORDER BY ${col} DESC, lastSeen DESC
    LIMIT ?7`

  const rows = db
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
  // Attach the latest display name per clan (cheap: leaderboard is capped).
  return rows.map((r) => ({ ...r, clanName: clanNameForGuid(r.clanGuid) }))
}

// One clan's full stats: totals, current roster (distinct members seen in-window),
// per-server split and distinct bosses felled. Returns null for an unknown clan.
export function getClanStats(clanGuid) {
  if (!clanGuid || typeof clanGuid !== 'string') return null
  const resetEntries = Object.entries(getLeaderboardResets())
  const floorS = resetFloorAnon('startedAt', resetEntries)
  const floorK = resetFloorAnon('occurredAt', resetEntries)

  const totals = db
    .prepare(
      `SELECT
         (SELECT MAX(serverId) FROM play_sessions WHERE clanGuid = ?) AS serverId,
         COALESCE(p.seconds, 0) AS seconds,
         COALESCE(p.members, 0) AS members,
         COALESCE(k.vblood, 0)  AS vblood,
         COALESCE(k.vbloodDistinct, 0) AS distinctBosses,
         COALESCE(k.pvp, 0)     AS pvp,
         CAST(
           COALESCE(p.seconds, 0) / 3600.0 * ?
           + COALESCE(k.vbloodDistinct, 0) * ?
           + (COALESCE(k.vblood, 0) - COALESCE(k.vbloodDistinct, 0)) * ?
           + COALESCE(k.pvp, 0) * ?
         AS INTEGER) AS points
       FROM (SELECT 1) d
       LEFT JOIN (
         SELECT SUM(seconds) AS seconds, COUNT(DISTINCT steamId) AS members
           FROM play_sessions WHERE clanGuid = ?${floorS.sql}
       ) p ON 1=1
       LEFT JOIN (
         SELECT SUM(CASE WHEN kind='vblood' THEN 1 ELSE 0 END) AS vblood,
                COUNT(DISTINCT CASE WHEN kind='vblood' AND victim IS NOT NULL THEN victim END) AS vbloodDistinct,
                SUM(CASE WHEN kind='pvp' THEN 1 ELSE 0 END) AS pvp
           FROM kill_events WHERE clanGuid = ?${floorK.sql}
       ) k ON 1=1`,
    )
    .get(
      clanGuid,
      POINTS.perHour, POINTS.perVBloodFirst, POINTS.perVBloodRepeat, POINTS.perPvpKill,
      clanGuid, ...floorS.params,
      clanGuid, ...floorK.params,
    )

  if (!totals || (totals.seconds === 0 && totals.vblood === 0 && totals.pvp === 0)) return null

  // Roster: distinct members seen under this clan, with each one's contribution.
  const roster = db
    .prepare(
      `SELECT ids.steamId AS steamId,
              (SELECT charName FROM (
                 SELECT charName, startedAt AS t FROM play_sessions
                   WHERE steamId = ids.steamId AND charName IS NOT NULL
                 UNION ALL
                 SELECT charName, occurredAt AS t FROM kill_events
                   WHERE steamId = ids.steamId AND charName IS NOT NULL
               ) ORDER BY t DESC LIMIT 1) AS charName,
              COALESCE(p.seconds, 0) AS seconds,
              COALESCE(k.vblood, 0)  AS vblood,
              COALESCE(k.pvp, 0)     AS pvp
         FROM (
           SELECT DISTINCT steamId FROM play_sessions WHERE clanGuid = ?${floorS.sql}
           UNION
           SELECT DISTINCT steamId FROM kill_events WHERE clanGuid = ?${floorK.sql}
         ) ids
         LEFT JOIN (
           SELECT steamId, SUM(seconds) AS seconds FROM play_sessions
             WHERE clanGuid = ?${floorS.sql} GROUP BY steamId
         ) p ON p.steamId = ids.steamId
         LEFT JOIN (
           SELECT steamId,
                  SUM(CASE WHEN kind='vblood' THEN 1 ELSE 0 END) AS vblood,
                  SUM(CASE WHEN kind='pvp' THEN 1 ELSE 0 END)    AS pvp
             FROM kill_events WHERE clanGuid = ?${floorK.sql} GROUP BY steamId
         ) k ON k.steamId = ids.steamId
         ORDER BY seconds DESC`,
    )
    .all(
      clanGuid, ...floorS.params,
      clanGuid, ...floorK.params,
      clanGuid, ...floorS.params,
      clanGuid, ...floorK.params,
    )

  return {
    clanGuid,
    clanName: clanNameForGuid(clanGuid),
    serverId: totals.serverId,
    seconds: totals.seconds,
    members: totals.members,
    vblood: totals.vblood,
    distinctBosses: totals.distinctBosses,
    pvp: totals.pvp,
    points: totals.points,
    roster,
  }
}

// Clan-vs-clan war record for one clan: head-to-head PvP kills against each rival
// clan (kills = we killed them, deaths = they killed us). Returns an array sorted by
// total engagement, newest activity first. Only PvP kills with both clans set count.
export function getClanWars(clanGuid, limit = 20) {
  if (!clanGuid || typeof clanGuid !== 'string') return []
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50)
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  // Kills we landed on other clans, grouped by the rival clanGuid.
  const kills = db
    .prepare(
      `SELECT victimClanGuid AS rival, COUNT(*) AS kills, MAX(occurredAt) AS last
         FROM kill_events
        WHERE kind = 'pvp' AND clanGuid = ? AND victimClanGuid IS NOT NULL
          AND victimClanGuid != ?${floorK.sql}
        GROUP BY victimClanGuid`,
    )
    .all(clanGuid, clanGuid, ...floorK.params)

  // Deaths: kills other clans landed on us, grouped by the attacker clanGuid.
  const deaths = db
    .prepare(
      `SELECT clanGuid AS rival, COUNT(*) AS deaths, MAX(occurredAt) AS last
         FROM kill_events
        WHERE kind = 'pvp' AND victimClanGuid = ? AND clanGuid IS NOT NULL
          AND clanGuid != ?${floorK.sql}
        GROUP BY clanGuid`,
    )
    .all(clanGuid, clanGuid, ...floorK.params)

  const byRival = new Map()
  const bump = (rival, patch, last) => {
    const e = byRival.get(rival) || { rival, kills: 0, deaths: 0, last: '0' }
    Object.assign(e, { ...e, ...patch })
    if (last > e.last) e.last = last
    byRival.set(rival, e)
  }
  for (const r of kills) bump(r.rival, { kills: r.kills }, r.last)
  for (const r of deaths) {
    const e = byRival.get(r.rival)
    if (e) { e.deaths = r.deaths; if (r.last > e.last) e.last = r.last }
    else bump(r.rival, { deaths: r.deaths }, r.last)
  }

  return [...byRival.values()]
    .map((e) => ({ ...e, clanName: clanNameForGuid(e.rival) }))
    .sort((a, b) => b.kills + b.deaths - (a.kills + a.deaths) || (b.last > a.last ? 1 : -1))
    .slice(0, cap)
}

// The single most active clan-vs-clan feud across all clans (for the milestones
// strip). Returns { a:{clanGuid,clanName}, b:{clanGuid,clanName}, aKills, bKills }
// or null when there isn't a clan matchup with enough kills yet.
export function getHottestClanWar() {
  const floorK = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))
  // Order each pair canonically (min,max) so A→B and B→A collapse into one feud.
  const rows = db
    .prepare(
      `SELECT
         CASE WHEN clanGuid < victimClanGuid THEN clanGuid ELSE victimClanGuid END AS lo,
         CASE WHEN clanGuid < victimClanGuid THEN victimClanGuid ELSE clanGuid END AS hi,
         SUM(CASE WHEN clanGuid < victimClanGuid THEN 1 ELSE 0 END) AS loKills,
         SUM(CASE WHEN clanGuid < victimClanGuid THEN 0 ELSE 1 END) AS hiKills,
         COUNT(*) AS total
       FROM kill_events
      WHERE kind = 'pvp' AND clanGuid IS NOT NULL AND victimClanGuid IS NOT NULL
        AND clanGuid != victimClanGuid${floorK.sql}
      GROUP BY lo, hi
      ORDER BY total DESC LIMIT 1`,
    )
    .get(...floorK.params)
  if (!rows || rows.total < 2) return null
  return {
    a: { clanGuid: rows.lo, clanName: clanNameForGuid(rows.lo), kills: rows.loKills },
    b: { clanGuid: rows.hi, clanName: clanNameForGuid(rows.hi), kills: rows.hiKills },
  }
}

// --- Castle raids (aggregation) --------------------------------------------
// The mod reports one raid_events row per raid, with the attacker (raider) and the
// defender (raided castle owner) each resolved to a steamId + clan where possible.
// These power the raid feed, the per-clan raid record and the "most feared raiders".

// Recent raids across all servers (or one), newest first. index.js resolves each
// side to a member link. Not season-floored — it's an inherently recent list.
export function getRaidFeed(serverId = null, limit = 20) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50)
  return db
    .prepare(
      `SELECT eventId, serverId, kind, occurredAt,
              attackerSteamId, attackerName, attackerClanGuid, attackerClanName,
              defenderSteamId, defenderName, defenderClanGuid, defenderClanName
         FROM raid_events
        WHERE (?1 IS NULL OR serverId = ?1)
        ORDER BY occurredAt DESC
        LIMIT ?2`,
    )
    .all(serverId, cap)
}

// One clan's raid record: how many raids it landed vs suffered, plus a per-rival
// breakdown (raided them / raided by them), respecting season resets. Returns
// { raidsDone, raidsSuffered, rivals: [{ clanGuid, clanName, raided, raidedBy, last }] }.
export function getClanRaidRecord(clanGuid) {
  if (!clanGuid || typeof clanGuid !== 'string') {
    return { raidsDone: 0, raidsSuffered: 0, rivals: [] }
  }
  const floor = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))

  const totals = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM raid_events
            WHERE attackerClanGuid = ?1${floor.sql}) AS raidsDone,
         (SELECT COUNT(*) FROM raid_events
            WHERE defenderClanGuid = ?1${floor.sql}) AS raidsSuffered`,
    )
    .get(clanGuid, ...floor.params, ...floor.params)

  // Raids we landed on other clans, grouped by the defender clan.
  const done = db
    .prepare(
      `SELECT defenderClanGuid AS rival, COUNT(*) AS n, MAX(occurredAt) AS last
         FROM raid_events
        WHERE attackerClanGuid = ? AND defenderClanGuid IS NOT NULL
          AND defenderClanGuid != ?${floor.sql}
        GROUP BY defenderClanGuid`,
    )
    .all(clanGuid, clanGuid, ...floor.params)

  // Raids other clans landed on us, grouped by the attacker clan.
  const suffered = db
    .prepare(
      `SELECT attackerClanGuid AS rival, COUNT(*) AS n, MAX(occurredAt) AS last
         FROM raid_events
        WHERE defenderClanGuid = ? AND attackerClanGuid IS NOT NULL
          AND attackerClanGuid != ?${floor.sql}
        GROUP BY attackerClanGuid`,
    )
    .all(clanGuid, clanGuid, ...floor.params)

  const byRival = new Map()
  const touch = (rival) =>
    byRival.get(rival) || byRival.set(rival, { rival, raided: 0, raidedBy: 0, last: '0' }).get(rival)
  for (const r of done) {
    const e = touch(r.rival)
    e.raided = r.n
    if (r.last > e.last) e.last = r.last
  }
  for (const r of suffered) {
    const e = touch(r.rival)
    e.raidedBy = r.n
    if (r.last > e.last) e.last = r.last
  }

  const rivals = [...byRival.values()]
    .map((e) => ({ clanGuid: e.rival, clanName: clanNameForGuid(e.rival), raided: e.raided, raidedBy: e.raidedBy, last: e.last }))
    .sort((a, b) => b.raided + b.raidedBy - (a.raided + a.raidedBy) || (b.last > a.last ? 1 : -1))

  return { raidsDone: totals.raidsDone || 0, raidsSuffered: totals.raidsSuffered || 0, rivals }
}

// The clan with the most raids landed (for the milestones strip). Returns
// { clanGuid, clanName, raids } or null when no clan has raided yet.
export function getTopRaiderClan() {
  const floor = resetFloorAnon('occurredAt', Object.entries(getLeaderboardResets()))
  const row = db
    .prepare(
      `SELECT attackerClanGuid AS guid, COUNT(*) AS raids
         FROM raid_events
        WHERE attackerClanGuid IS NOT NULL${floor.sql}
        GROUP BY attackerClanGuid
        ORDER BY raids DESC LIMIT 1`,
    )
    .get(...floor.params)
  if (!row || row.raids < 1) return null
  return { clanGuid: row.guid, clanName: clanNameForGuid(row.guid), raids: row.raids }
}

// --- Play streaks ----------------------------------------------------------
// Consecutive-day play streaks derived from the (UTC) dates a player had sessions.

// Whole-day difference between two 'YYYY-MM-DD' dates (b - a), in UTC.
function dayDiff(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5)
}

// Current + longest streak from an ascending list of distinct 'YYYY-MM-DD' dates.
// "Current" only counts if the last active day is today or yesterday (UTC), so a
// streak isn't considered broken until a full day passes with no play.
function streakFromDates(dates) {
  if (!dates.length) return { current: 0, longest: 0 }
  let longest = 1
  let run = 1
  for (let i = 1; i < dates.length; i++) {
    run = dayDiff(dates[i - 1], dates[i]) === 1 ? run + 1 : 1
    if (run > longest) longest = run
  }
  const today = new Date().toISOString().slice(0, 10)
  let current = 0
  if (dayDiff(dates[dates.length - 1], today) <= 1) {
    current = 1
    for (let i = dates.length - 1; i > 0; i--) {
      if (dayDiff(dates[i - 1], dates[i]) === 1) current++
      else break
    }
  }
  return { current, longest }
}

// Current + longest play streak for one player. Respects season-reset floors.
export function getPlayerStreak(steamId) {
  if (!steamId || !/^\d{5,20}$/.test(steamId)) return { current: 0, longest: 0 }
  const floorS = resetFloorAnon('startedAt', Object.entries(getLeaderboardResets()))
  const rows = db
    .prepare(
      `SELECT DISTINCT DATE(startedAt) AS d FROM play_sessions
        WHERE steamId = ?${floorS.sql} ORDER BY d ASC`,
    )
    .all(steamId, ...floorS.params)
  return streakFromDates(rows.map((r) => r.d))
}

// Leaderboard of active play streaks. Returns players with a live streak (or a
// longest > 1), sorted by current streak then longest. Respects season resets.
export function getTopStreaks(limit = 5) {
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 50)
  const floorS = resetFloorAnon('startedAt', Object.entries(getLeaderboardResets()))
  const rows = db
    .prepare(
      `SELECT steamId, DATE(startedAt) AS d, MAX(charName) AS charName
         FROM play_sessions WHERE 1=1${floorS.sql}
        GROUP BY steamId, DATE(startedAt) ORDER BY steamId, d ASC`,
    )
    .all(...floorS.params)

  const byPlayer = new Map()
  for (const r of rows) {
    let e = byPlayer.get(r.steamId)
    if (!e) {
      e = { dates: [], charName: null }
      byPlayer.set(r.steamId, e)
    }
    e.dates.push(r.d)
    if (r.charName) e.charName = r.charName
  }

  const out = []
  for (const [steamId, e] of byPlayer) {
    const s = streakFromDates(e.dates)
    if (s.current > 0 || s.longest > 1) out.push({ steamId, charName: e.charName, ...s })
  }
  out.sort((a, b) => b.current - a.current || b.longest - a.longest)
  return out.slice(0, cap)
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
