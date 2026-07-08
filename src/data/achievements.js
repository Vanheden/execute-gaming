// ---------------------------------------------------------------------------
// Achievement catalog — single source of truth for frontend AND backend
// ---------------------------------------------------------------------------
// `auto: true`  → computed on the fly from account data (never stored/granted).
// no `auto`     → admin-granted, stored in the `achievements` table.
// `founderCount` controls how many of the earliest members get the founder badge.
// ---------------------------------------------------------------------------
export const FOUNDER_COUNT = 10
export const VETERAN_DAYS = 90

export const ACHIEVEMENTS = {
  founder: {
    name: 'Founding Member',
    icon: '🏛️',
    desc: `One of the first ${FOUNDER_COUNT} to join the community.`,
    auto: true,
  },
  veteran: {
    name: 'Veteran',
    icon: '🎖️',
    desc: `${VETERAN_DAYS}+ days in the community.`,
    auto: true,
  },
  staff: {
    name: 'Staff',
    icon: '🛡️',
    desc: 'Part of the admin team.',
    auto: true,
  },
  'event-winner': {
    name: 'Event Champion',
    icon: '🏆',
    desc: 'Won a community event or tournament.',
  },
  'bug-hunter': {
    name: 'Bug Hunter',
    icon: '🐛',
    desc: 'Reported a valuable bug or exploit.',
  },
  supporter: {
    name: 'Supporter',
    icon: '💜',
    desc: 'Helps keep the community running.',
  },
  'content-creator': {
    name: 'Content Creator',
    icon: '🎬',
    desc: 'Makes videos, guides or streams for the community.',
  },
  'top-fragger': {
    name: 'Top Fragger',
    icon: '⚔️',
    desc: 'Dominates the Duo PvP ladder.',
  },
}

// Codes an admin can grant/revoke (everything that isn't auto-computed).
export const GRANTABLE = Object.entries(ACHIEVEMENTS)
  .filter(([, a]) => !a.auto)
  .map(([code]) => code)

// Merge a catalog entry onto a stored/computed badge, dropping unknown codes.
export function decorate(code, extra = {}) {
  const def = ACHIEVEMENTS[code]
  if (!def) return null
  return { code, name: def.name, icon: def.icon, desc: def.desc, ...extra }
}
