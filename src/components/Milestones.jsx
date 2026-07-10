import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// Community-wide totals + the hottest PvP feud + top play streaks. Rendered at the
// top of the leaderboard page. Everything is aggregate/public — no PII.

function formatHours(seconds) {
  const h = Math.round(seconds / 3600)
  return h.toLocaleString()
}

const TILES = [
  { key: 'seconds', icon: '⏳', label: 'Hours played', fmt: (s) => formatHours(s.seconds) },
  { key: 'vblood', icon: '🩸', label: 'V Bloods felled', fmt: (s) => s.vblood.toLocaleString() },
  { key: 'pvp', icon: '⚔️', label: 'PvP kills', fmt: (s) => s.pvp.toLocaleString() },
  { key: 'players', icon: '🧛', label: 'Vampires tracked', fmt: (s) => s.players.toLocaleString() },
]

// A player name that links to their profile (member → /u/:key, guest → /p/:steamId).
function PlayerLink({ p, className }) {
  const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
  return (
    <a className={className} {...linkProps(href)} title={p.charName}>
      {p.charName}
    </a>
  )
}

export default function Milestones() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/global-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(null))
  }, [])

  if (!data?.stats) return null
  const { stats, hottestFeud, topStreaks } = data
  // Nothing tracked yet → don't render an empty strip.
  if (!stats.sessions && !stats.vblood && !stats.pvp) return null

  return (
    <div className="milestones">
      <h3 className="milestones__title">🏰 Community milestones</h3>
      <div className="milestones__grid">
        {TILES.map((t) => (
          <div className="milestones__tile" key={t.key}>
            <span className="milestones__icon">{t.icon}</span>
            <span className="milestones__num">{t.fmt(stats)}</span>
            <span className="milestones__label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="milestones__extra">
        {hottestFeud && (
          <div className="milestones__feud">
            <span className="milestones__feudicon">🔥</span>
            <span className="milestones__feudlabel">Hottest feud</span>
            <span className="milestones__feudline">
              <PlayerLink p={hottestFeud.killer} className="milestones__feudname" />
              {' has slain '}
              <PlayerLink p={hottestFeud.victim} className="milestones__feudname" />
              {' '}
              <strong>{hottestFeud.kills}×</strong>
            </span>
          </div>
        )}

        {topStreaks?.length > 0 && (
          <div className="milestones__streaks">
            <span className="milestones__streakhead">🔥 Longest active streaks</span>
            <ol className="milestones__streaklist">
              {topStreaks.map((s) => (
                <li className="milestones__streakrow" key={s.steamId}>
                  <PlayerLink p={s} className="milestones__streakname" />
                  <span className="milestones__streakdays">
                    {s.current > 0 ? `${s.current}🔥` : `best ${s.longest}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
