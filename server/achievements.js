// ---------------------------------------------------------------------------
// Achievements — admin-granted badges (stored) + automatic ones (computed)
// ---------------------------------------------------------------------------
import { db } from './db.js'
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
function autoCodes(user, rank) {
  const codes = []
  if (rank && rank <= FOUNDER_COUNT) codes.push('founder')
  if (user.createdAt) {
    const ageDays = (Date.now() - new Date(user.createdAt).getTime()) / 86_400_000
    if (ageDays >= VETERAN_DAYS) codes.push('veteran')
  }
  if (user.role === 'admin') codes.push('staff')
  return codes
}

// Full decorated badge list for a user (auto first, then granted). `rank` is
// the 1-based join position (from listUsers order); pass null if unknown.
export function badgesForUser(user, rank) {
  if (!user) return []
  const auto = autoCodes(user, rank).map((code) => decorate(code, { auto: true }))
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
export function catalogWithCounts(members) {
  const granted = grantedCounts()
  return Object.entries(ACHIEVEMENTS).map(([code, def]) => {
    let holders
    if (code === 'founder') holders = Math.min(FOUNDER_COUNT, members.length)
    else if (code === 'veteran')
      holders = members.filter(
        (m) => (Date.now() - new Date(m.createdAt).getTime()) / 86_400_000 >= VETERAN_DAYS,
      ).length
    else if (code === 'staff') holders = members.filter((m) => m.role === 'admin').length
    else holders = granted[code] || 0
    return { code, name: def.name, icon: def.icon, desc: def.desc, auto: !!def.auto, holders }
  })
}

export { ACHIEVEMENTS, GRANTABLE }
