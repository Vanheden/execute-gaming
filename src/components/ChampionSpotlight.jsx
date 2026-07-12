import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'
import { rankForPoints } from '../data/ranks.js'

function hours(seconds) {
  return `${Math.floor((seconds || 0) / 3600)}h`
}

// A cinematic band that crowns the current #1 player — the face to beat. Big rank
// badge, headline stats and a "dethrone them" call to action into the leaderboard.
export default function ChampionSpotlight() {
  const [champ, setChamp] = useState(undefined)

  useEffect(() => {
    let live = true
    fetch('/api/leaderboard?limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setChamp(d?.entries?.[0] || null))
      .catch(() => live && setChamp(null))
    return () => {
      live = false
    }
  }, [])

  if (!champ) return null

  const rank = rankForPoints(champ.allTimePoints)
  const href = champ.member ? `/u/${champ.member.key}` : `/p/${champ.steamId}`
  const stats = [
    { v: champ.points.toLocaleString(), l: 'points' },
    { v: hours(champ.seconds), l: 'played' },
    { v: champ.vblood, l: 'V Bloods' },
    { v: champ.pvp, l: 'PvP kills' },
  ]

  return (
    <section className="section spotlight" id="champion" style={{ '--rank': rank.tier.color }}>
      <div className="spotlight__aura" aria-hidden="true" />
      <div className="container spotlight__inner">
        <p className="spotlight__eyebrow">
          <span className="spotlight__crown" aria-hidden="true">
            👑
          </span>
          Reigning champion
        </p>

        <div className="spotlight__body">
          <div className="spotlight__badge">
            <span className="spotlight__badgeicon" aria-hidden="true">
              {rank.tier.icon}
            </span>
            <span className="spotlight__badgename">{rank.tier.name}</span>
          </div>

          <div className="spotlight__info">
            <a className="spotlight__name" {...linkProps(href)}>
              {champ.name}
            </a>
            <dl className="spotlight__stats">
              {stats.map((s) => (
                <div key={s.l}>
                  <dd>{s.v}</dd>
                  <dt>{s.l}</dt>
                </div>
              ))}
            </dl>
            <a className="btn btn--lg spotlight__cta" {...linkProps('/leaderboard')}>
              Dethrone them →
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
