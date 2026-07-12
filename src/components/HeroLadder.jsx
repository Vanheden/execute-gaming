import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'
import { servers } from '../data/servers.js'
import { rankForPoints } from '../data/ranks.js'

// The live "glass" panel on the right of the hero: the top of the ladder plus a
// live "N online now" pulse. It's the first proof a visitor gets that this is an
// active, competitive community — one tap into the full leaderboard.
export default function HeroLadder() {
  const [top, setTop] = useState(undefined)
  const [online, setOnline] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/leaderboard?limit=3')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setTop(d?.entries || []))
      .catch(() => live && setTop([]))

    // Aggregate the live online count across every server (BattleMetrics-backed).
    Promise.all(
      servers.map((s) =>
        fetch(`/api/servers/${s.id}/online`)
          .then((r) => (r.ok ? r.json() : { players: [] }))
          .catch(() => ({ players: [] })),
      ),
    ).then((list) => {
      if (!live) return
      setOnline(list.reduce((n, d) => n + (d.players?.length || 0), 0))
    })

    return () => {
      live = false
    }
  }, [])

  // While loading, hold the space with a soft skeleton so the hero doesn't jump.
  if (top === undefined) return <aside className="heroladder heroladder--skeleton" aria-hidden="true" />
  if (!top.length) return null

  return (
    <aside className="heroladder">
      <div className="heroladder__head">
        <span className="heroladder__eyebrow">🏆 Top of the ladder</span>
        {online > 0 && (
          <span className="heroladder__online">
            <span className="heroladder__dot" aria-hidden="true" />
            {online} online
          </span>
        )}
      </div>
      <ol className="heroladder__list">
        {top.map((p, i) => {
          const rank = rankForPoints(p.allTimePoints)
          const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
          return (
            <li className={`heroladder__row ${i === 0 ? 'heroladder__row--first' : ''}`} key={p.steamId}>
              <span className="heroladder__pos">{i + 1}</span>
              <span className="heroladder__badge" style={{ color: rank.tier.color }} title={rank.tier.name}>
                {rank.tier.icon}
              </span>
              <a className="heroladder__name" {...linkProps(href)} title={p.name}>
                {p.name}
              </a>
              <span className="heroladder__pts">{p.points.toLocaleString()}</span>
            </li>
          )
        })}
      </ol>
      <a className="heroladder__cta" {...linkProps('/leaderboard')}>
        Full leaderboard →
      </a>
    </aside>
  )
}
