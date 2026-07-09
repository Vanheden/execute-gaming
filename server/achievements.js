// ---------------------------------------------------------------------------
// Achievements — admin-granted badges (stored) + automatic ones (computed)
// ---------------------------------------------------------------------------
import { db } from './db.js'
import { getPlayerTotalsBatch } from './playtime.js'
import {
  ACHIEVEMENTS,
  GRANTABLE,
  FOUNDER_COUNT,
  VETERAN_DAYS,
  decorate,
} from '../src/data/achievements.js'

const now = () => new Date().toISOString()

// Stored (manual) achievement codes for a user, oldest first.
export function listGranted(userId) {
  return db
    .prepare('SELECT code, grantedAt FROM achievements WHERE userId = ? ORDER BY grantedAt ASC')
    .all(userId)
}

export function grantAchievement(userId, code, grantedBy) {
  if (!GRANTABLE.includes(code)) return false
  db.prepare(
    `INSERT INTO achievements (userId, code, grantedAt, grantedBy) VALUES (?, ?, ?, ?)
     ON CONFLICT(userId, code) DO NOTHING`,
  ).run(userId, code, now(), grantedBy ?? null)
  return true
}

export function revokeAchievement(userId, code) {
  return db.prepare('DELETE FROM achievements WHERE userId = ? AND code = ?').run(userId, code).changes > 0
}

// Automatic badges derived from account data. `rank` is 1-based join order.
// `gameStats` is an optional { seconds, vblood, pvp, points } from getPlayerTotals.
function autoCodes(user, rank, gameStats) {
  const codes = []
  if (rank && rank <= FOUNDER_COUNT) codes.push('founder')
  if (user.createdAt) {
    const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 86_400_000
    if (ageDays >= VETERAN_DAYS) codes.push('veteran')
  }
  if (user.role === 'admin') codes.push('staff')
  if (gameStats) {
    const hours = gameStats.seconds / 3600
    if (gameStats.vblood >= 1) codes.push('blood-initiate')
    if (gameStats.vblood >= 10) codes.push('vblood-hunter')
    if (gameStats.vblood >= 25) codes.push('vblood-slayer')
    if (gameStats.pvp >= 10) codes.push('pvp-contender')
    if (gameStats.pvp >= 50) codes.push('pvp-duelist')
    if (hours >= 100) codes.push('dedicated')
    if (hours >= 500) codes.push('no-life')
    if (gameStats.points >= 1000) codes.push('rising-star')
    if (gameStats.points >= 5000) codes.push('legend')
  }
  return codes
}

// Full decorated badge list for a user (auto first, then granted). `rank` is
// the 1-based join position (from listUsers order); pass null if unknown.
// `gameStats` is optional { seconds, vblood, pvp, points } for stat-based badges.
export function badgesForUser(user, rank, gameStats) {
  if (!user) return []
  const auto = autoCodes(user, rank, gameStats).map((code) => decorate(code, { auto: true }))
  const granted = listGranted(user.id)
    .map((g) => decorate(g.code, { grantedAt: g.grantedAt }))
    .filter(Boolean)
  return [...auto, ...granted].filter(Boolean)
}

// How many members hold each granted (stored) badge → { code: count }.
function grantedCounts() {
  return db
    .prepare('SELECT code, COUNT(*) AS n FROM achievements GROUP BY code')
    .all()
    .reduce((map, r) => {
      map[r.code] = Number(r.n)
      return map
    }, {})
}

// Full catalog + a holder count for each badge. `members` is the (non-banned)
// user list; auto badges are counted from it, granted ones from the table.
// `memberSteamIds` is an optional map { userId: steamId } for game-stat badges.
export function catalogWithCounts(members, memberSteamIds) {
  const granted = grantedCounts()

  // Batch-fetch game totals for all members with a Steam link, so we can count
  // holders of stat-based auto badges (blood-initiate, dedicated, etc.).
  const steamIds = memberSteamIds ? Object.values(memberSteamIds) : []
  const totals = steamIds.length ? getPlayerTotalsBatch(steamIds) : {}

  return Object.entries(ACHIEVEMENTS).map(([code, def]) => {
    let holders
    if (code === 'founder') holders = Math.min(FOUNDER_COUNT, members.length)
    else if (code === 'veteran')
      holders = members.filter(
        (m) => (Date.now() - new Date(m.createdAt).getTime()) / 86_400_000 >= VETERAN_DAYS,
      ).length
    else if (code === 'staff') holders = members.filter((m) => m.role === 'admin').length
    else if (def.auto && memberSteamIds) {
      // Count members whose game stats meet this badge's threshold.
      holders = members.filter((m) => {
        const sid = memberSteamIds[m.id]
        if (!sid || !totals[sid]) return false
        const stats = totals[sid]
        const hours = stats.seconds / 3600
        switch (code) {
          case 'blood-initiate': return stats.vblood >= 1
          case 'vblood-hunter': return stats.vblood >= 10
          case 'vblood-slayer': return stats.vblood >= 25
          case 'pvp-contender': return stats.pvp >= 10
          case 'pvp-duelist': return stats.pvp >= 50
          case 'dedicated': return hours >= 100
          case 'no-life': return hours >= 500
          case 'rising-star': return stats.points >= 1000
          case 'legend': return stats.points >= 5000
          default: return false
        }
      }).length
    } else if (def.auto) {
      holders = 0
    } else holders = granted[code] || 0
    return { code, name: def.name, icon: def.icon, desc: def.desc, auto: !!def.auto, holders }
  })
}

export { ACHIEVEMENTS, GRANTABLE }
