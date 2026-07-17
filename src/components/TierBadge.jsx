import { vbloodTier } from '../data/vbloodTiers.js'

// A small difficulty-tier pill for a V Blood boss (by PrefabGUID). Renders nothing
// for an unknown boss, so callers can drop it in unconditionally. Display-only.
export default function TierBadge({ guid }) {
  const t = vbloodTier(guid)
  if (!t) return null
  return (
    <span className="tierbadge" style={{ '--tier': t.color }} title={`Difficulty: ${t.label}`}>
      {t.label}
    </span>
  )
}
