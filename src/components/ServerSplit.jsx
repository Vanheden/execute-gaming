import { servers } from '../data/servers.js'

// Short server label (drops the "V Rising — " prefix, e.g. "V Rising — Duo PvP"
// → "Duo PvP") for the compact legend.
const SERVER_BY_ID = Object.fromEntries(servers.map((s) => [s.id, s]))
const shortName = (id, fallback) => (SERVER_BY_ID[id]?.name || fallback || id).replace(/^.*—\s*/, '')

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// A stacked bar + legend showing how a player's playtime splits across servers,
// e.g. "Easy PvE 60% · Duo PvP 40%". `entries` is [{ serverId, name, accent,
// seconds }]. Renders nothing when there's no tracked playtime.
export default function ServerSplit({ entries }) {
  const parts = (entries || [])
    .filter((e) => e.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
  const total = parts.reduce((sum, e) => sum + e.seconds, 0)
  if (!total) return null

  const withPct = parts.map((e) => ({
    ...e,
    accent: e.accent || SERVER_BY_ID[e.serverId]?.accent || 'var(--c-cyan)',
    label: shortName(e.serverId, e.name),
    pct: Math.round((e.seconds / total) * 100),
  }))

  return (
    <div className="srvsplit">
      <div className="srvsplit__bar" role="img" aria-label="Playtime by server">
        {withPct.map((e) => (
          <span
            key={e.serverId}
            className="srvsplit__seg"
            style={{ width: `${(e.seconds / total) * 100}%`, '--srv': e.accent }}
            title={`${e.label} · ${formatDuration(e.seconds)} (${e.pct}%)`}
          />
        ))}
      </div>
      <ul className="srvsplit__legend">
        {withPct.map((e) => (
          <li className="srvsplit__item" key={e.serverId} style={{ '--srv': e.accent }}>
            <span className="srvsplit__dot" aria-hidden="true" />
            <span className="srvsplit__name">{e.label}</span>
            <span className="srvsplit__pct">{e.pct}%</span>
            <span className="srvsplit__dur">{formatDuration(e.seconds)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
