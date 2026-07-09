// ---------------------------------------------------------------------------
// V Blood boss PrefabGUID → readable name.
// ---------------------------------------------------------------------------
// The in-game mod sends a V Blood kill's `victim` as the boss's PrefabGUID hash
// (a stable integer, sent as a string). This maps the confirmed ones to a name so
// the leaderboard can show "Latest: Alpha Wolf" instead of a bare number.
//
// ONLY add an entry once its hash is CONFIRMED from a real kill — read it from the
// game-server log line (`Death: diedPrefab=… vblood=True`) as bosses are killed, or
// from a published table. NEVER guess a name for an unknown hash; unknown hashes
// fall back to a neutral label on the site so we never mislabel a boss.
// ---------------------------------------------------------------------------
export const VBLOOD_NAMES = {
  '-1905691330': 'Alpha Wolf', // confirmed live 2026-07-09
}

// Resolve a PrefabGUID hash (number or string) to a known boss name, or null if we
// don't have it mapped yet. Callers show a neutral fallback for null — never a guess.
export function vbloodName(victim) {
  if (victim == null) return null
  return VBLOOD_NAMES[String(victim)] || null
}
