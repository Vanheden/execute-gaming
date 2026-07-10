import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// PvP rivalries + play streak for one player, keyed by SteamID. Shown on both the
// guest game-stats page (/p/:steamId) and member profiles (/u/:key). Renders
// nothing until data loads, and nothing if the player has no PvP history/streak.

function PlayerLink({ p }) {
  // Prey resolved to no account/steamId (e.g. a since-renamed guest) isn't linkable.
  if (!p.steamId && !p.member) return <span className="rival__name">{p.charName}</span>
  const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
  return (
    <a className="rival__name rival__name--link" {...linkProps(href)}>
      {p.charName}
    </a>
  )
}

export default function Rivalries({ steamId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!steamId) return
    let live = true
    setData(null)
    fetch(`/api/player/${encodeURIComponent(steamId)}/rivalries`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d))
      .catch(() => live && setData({ nemeses: [], prey: [], streak: { current: 0, longest: 0 } }))
    return () => {
      live = false
    }
  }, [steamId])

  if (!data) return null
  const { nemeses = [], prey = [], streak = { current: 0, longest: 0 } } = data
  const hasStreak = streak.current > 0 || streak.longest > 1
  if (!nemeses.length && !prey.length && !hasStreak) return null

  const nemesis = nemeses[0]
  const favouritePrey = prey[0]

  return (
    <section className="pubcard__section">
      <h2 className="pubcard__label">Rivalries</h2>

      {hasStreak && (
        <div className="rival__streak">
          <span className="rival__streakicon" aria-hidden="true">
            🔥
          </span>
          <span className="rival__streaknum">{streak.current}</span>
          <span className="rival__streaklabel">
            day streak{streak.longest > streak.current ? ` · best ${streak.longest}` : ''}
          </span>
        </div>
      )}

      <div className="rival__grid">
        {nemesis && (
          <div className="rival__card rival__card--nemesis">
            <span className="rival__role">☠️ Nemesis</span>
            <PlayerLink p={nemesis} />
            <span className="rival__score">
              killed you <strong>{nemesis.kills}×</strong>
              {typeof nemesis.revenge === 'number' && (
                <>
                  {' · '}
                  you got {nemesis.revenge} back
                </>
              )}
            </span>
          </div>
        )}

        {favouritePrey && (
          <div className="rival__card rival__card--prey">
            <span className="rival__role">🎯 Favourite prey</span>
            <PlayerLink p={favouritePrey} />
            <span className="rival__score">
              slain <strong>{favouritePrey.kills}×</strong>
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
