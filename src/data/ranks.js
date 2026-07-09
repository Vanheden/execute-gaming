// ---------------------------------------------------------------------------
// Rank ladder — "Vampire Ascension".
// ---------------------------------------------------------------------------
// A player's rank is derived from their ALL-TIME Points (10/h + V Blood kills +
// PvP kills; see server/playtime.js for the weights). Rank is deliberately
// independent of the leaderboard's period/server filter — it's a persistent
// identity, so it always reflects lifetime progress.
//
// This is the single source of truth: edit a threshold/name/colour/icon here and
// the whole site (leaderboard rank pill + profile rank badge) updates. Tiers must
// stay ordered ascending by `min`, and the first tier must have `min: 0`.
// ---------------------------------------------------------------------------
export const RANKS = [
  { id: 'fledgling', name: 'Fledgling', min: 0, icon: '🦇', color: '#9aa3b2' },
  { id: 'rogue', name: 'Rogue', min: 250, icon: '🗡️', color: '#3ee089' },
  { id: 'nightborne', name: 'Nightborne', min: 750, icon: '🌙', color: '#33c9c9' },
  { id: 'bloodletter', name: 'Bloodletter', min: 1750, icon: '🩸', color: '#ff6b81' },
  { id: 'dreadknight', name: 'Dread Knight', min: 3500, icon: '⚔️', color: '#7c4dff' },
  { id: 'elder', name: 'Elder', min: 6000, icon: '👑', color: '#9d7bff' },
  { id: 'nightlord', name: 'Nightlord', min: 10000, icon: '🦴', color: '#f5b642' },
  { id: 'dracula', name: 'Dracula', min: 16000, icon: '🧛', color: '#ffcf40' },
]

// Resolve a point total to its current rank plus progress toward the next tier.
// Returns { tier, next, index, progressPct (0–100), toNext, isMax }.
export function rankForPoints(points) {
  const p = Math.max(0, Number(points) || 0)
  let index = 0
  for (let i = 0; i < RANKS.length; i++) if (p >= RANKS[i].min) index = i
  const tier = RANKS[index]
  const next = RANKS[index + 1] || null
  const span = next ? next.min - tier.min : 0
  const progressPct = next && span > 0 ? Math.min(100, Math.round(((p - tier.min) / span) * 100)) : 100
  const toNext = next ? Math.max(0, next.min - p) : 0
  return { tier, next, index, progressPct, toNext, isMax: !next }
}
