// ---------------------------------------------------------------------------
// Rotating daily / weekly challenges.
// ---------------------------------------------------------------------------
// A deterministic daily + weekly objective (picked from a pool by hashing the
// period key, so it rotates on its own with no admin action). Progress is computed
// live from the raw kill_events — no per-player counters to keep in sync. The first
// time a player crosses the target we record ONE completion row (idempotent) and
// return it so the kill-ingest response can announce it in-game. Completions award
// "Challenge Points", a separate score from the main leaderboard, so this never
// touches the core points/ranking maths.
// ---------------------------------------------------------------------------
import { db } from './db.js'
import { VBLOOD_TIERS } from '../src/data/vbloodTiers.js'

const SHARD_GUIDS = Object.entries(VBLOOD_TIERS)
  .filter(([, t]) => t.tier === 'Shard')
  .map(([g]) => g)

// Objective pool. `metric` maps to a progress query below. `bonus` is Challenge
// Points awarded on completion. Keep titles short — they ride the in-game chat.
const DAILY_POOL = [
  { id: 'd-vblood-3', title: 'Fell 3 V Bloods', metric: 'vblood', target: 3, bonus: 100 },
  { id: 'd-pvp-5', title: 'Land 5 PvP kills', metric: 'pvp', target: 5, bonus: 100 },
  { id: 'd-distinct-3', title: 'Fell 3 different V Bloods', metric: 'vbloodDistinct', target: 3, bonus: 100 },
  { id: 'd-shard-1', title: 'Fell a Shardbearer', metric: 'shardbearer', target: 1, bonus: 150 },
]
const WEEKLY_POOL = [
  { id: 'w-vblood-20', title: 'Fell 20 V Bloods this week', metric: 'vblood', target: 20, bonus: 300 },
  { id: 'w-pvp-25', title: 'Land 25 PvP kills this week', metric: 'pvp', target: 25, bonus: 300 },
  { id: 'w-distinct-10', title: 'Fell 10 different V Bloods this week', metric: 'vbloodDistinct', target: 10, bonus: 400 },
]

// --- Period boundaries (UTC) ------------------------------------------------
function dayStart(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function weekStart(d) {
  const s = dayStart(d)
  const dow = (s.getUTCDay() + 6) % 7 // 0 = Monday
  s.setUTCDate(s.getUTCDate() - dow)
  return s
}
const ymd = (d) => d.toISOString().slice(0, 10)

// Small stable string hash → non-negative int, for deterministic rotation.
function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// The active daily + weekly challenge for a moment in time. Deterministic: the same
// day always yields the same objective, and it rotates as the date advances.
export function activeChallenges(now = new Date()) {
  const dKey = `d:${ymd(dayStart(now))}`
  const wKey = `w:${ymd(weekStart(now))}`
  const daily = { ...DAILY_POOL[hash(dKey) % DAILY_POOL.length], scope: 'daily', periodKey: dKey, since: dayStart(now).toISOString() }
  const weekly = { ...WEEKLY_POOL[hash(wKey) % WEEKLY_POOL.length], scope: 'weekly', periodKey: wKey, since: weekStart(now).toISOString() }
  return { daily, weekly }
}

// A player's progress toward one challenge, from raw kill_events since `since`.
function progressFor(steamId, ch) {
  const p = [steamId, ch.since]
  let sql
  switch (ch.metric) {
    case 'vblood':
      sql = `SELECT COUNT(*) AS c FROM kill_events WHERE steamId = ? AND kind = 'vblood' AND occurredAt >= ?`
      break
    case 'pvp':
      sql = `SELECT COUNT(*) AS c FROM kill_events WHERE steamId = ? AND kind = 'pvp' AND occurredAt >= ?`
      break
    case 'vbloodDistinct':
      sql = `SELECT COUNT(DISTINCT victim) AS c FROM kill_events
               WHERE steamId = ? AND kind = 'vblood' AND victim IS NOT NULL AND occurredAt >= ?`
      break
    case 'shardbearer': {
      if (!SHARD_GUIDS.length) return 0
      const ph = SHARD_GUIDS.map(() => '?').join(',')
      sql = `SELECT COUNT(*) AS c FROM kill_events
               WHERE steamId = ? AND kind = 'vblood' AND occurredAt >= ? AND victim IN (${ph})`
      p.push(...SHARD_GUIDS)
      break
    }
    default:
      return 0
  }
  return db.prepare(sql).get(...p).c
}

const insertCompletion = db.prepare(
  `INSERT OR IGNORE INTO challenge_completions
     (steamId, challengeId, periodKey, serverId, charName, bonus, completedAt)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
)

// Check both active challenges for a player after a kill; record + return any that
// were just completed (for the in-game announcement). Idempotent per (player,
// challenge, period), so re-posts / repeated kills never double-award.
export function checkAndRecordCompletions(steamId, serverId, charName) {
  if (!steamId) return []
  const { daily, weekly } = activeChallenges()
  const done = []
  for (const ch of [daily, weekly]) {
    // Skip if already completed this period.
    const has = db
      .prepare(`SELECT 1 FROM challenge_completions WHERE steamId = ? AND challengeId = ? AND periodKey = ?`)
      .get(steamId, ch.id, ch.periodKey)
    if (has) continue
    if (progressFor(steamId, ch) >= ch.target) {
      insertCompletion.run(steamId, ch.id, ch.periodKey, serverId || null, charName || null, ch.bonus, new Date().toISOString())
      done.push(ch)
    }
  }
  return done
}

// Public state for the site widget: the two active challenges (with who's cleared
// them this period), plus the all-time Challenge Points champions.
export function getChallengeState(limit = 8) {
  const { daily, weekly } = activeChallenges()
  const withClears = (ch) => {
    const clears = db
      .prepare(
        `SELECT steamId, MAX(charName) AS charName, MAX(completedAt) AS at
           FROM challenge_completions WHERE challengeId = ? AND periodKey = ?
          GROUP BY steamId ORDER BY at ASC`,
      )
      .all(ch.id, ch.periodKey)
    return { id: ch.id, title: ch.title, scope: ch.scope, target: ch.target, bonus: ch.bonus, since: ch.since, clears }
  }
  const champions = db
    .prepare(
      `SELECT steamId, MAX(charName) AS charName, SUM(bonus) AS points, COUNT(*) AS clears
         FROM challenge_completions GROUP BY steamId
        ORDER BY points DESC, clears DESC LIMIT ?`,
    )
    .all(Math.min(Math.max(Number(limit) || 8, 1), 25))
  return { daily: withClears(daily), weekly: withClears(weekly), champions }
}

// Total Challenge Points for one player (for their profile).
export function challengePoints(steamId) {
  if (!steamId) return { points: 0, clears: 0 }
  const r = db
    .prepare(`SELECT COALESCE(SUM(bonus),0) AS points, COUNT(*) AS clears FROM challenge_completions WHERE steamId = ?`)
    .get(steamId)
  return { points: r.points, clears: r.clears }
}
