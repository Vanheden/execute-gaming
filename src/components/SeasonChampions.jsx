import { useEffect, useState } from 'react'
import { servers } from '../data/servers.js'
import { linkProps } from '../lib/router.js'

function formatDate(iso) {
  if (!iso) return 'Launch'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SeasonChampions() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/season-champions')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d.champions || {}))
      .catch(() => setData({}))
  }, [])

  if (!data) return null

  const hasAny = servers.some((s) => data[s.id]?.length > 0)
  if (!hasAny) return null

  return (
    <div className="champions">
      <h3 className="champions__title">🏆 Season Champions</h3>
      <div className="champions__grid">
        {servers.map((s) => {
          const champs = data[s.id] || []
          if (!champs.length) return null
          return (
            <div className="champions__server" key={s.id} style={{ '--srv': s.accent }}>
              <span className="champions__server-name">{s.name}</span>
              {champs.map((c, i) => {
                const href = c.member ? `/u/${c.member.key}` : `/p/${c.steamId}`
                return (
                  <div className="champions__row" key={i}>
                    <span className="champions__medal">{i === 0 ? '👑' : '🏆'}</span>
                    <a className="champions__name" {...linkProps(href)}>
                      {c.charName}
                    </a>
                    <span className="champions__pts">{c.points.toLocaleString()} pts</span>
                    <span className="champions__date">
                      {formatDate(c.seasonStart)} → {formatDate(c.seasonEnd)}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
