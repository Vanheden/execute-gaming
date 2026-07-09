import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

function timeAgo(minutes) {
  if (minutes == null) return ''
  const h = Math.floor(minutes / 60)
  const m = Math.floor(minutes % 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function OnlinePlayers({ serverId }) {
  const [players, setPlayers] = useState(null)

  useEffect(() => {
    let live = true
    const poll = () => {
      fetch(`/api/servers/${serverId}/online`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => live && setPlayers(d.players || []))
        .catch(() => live && setPlayers([]))
    }
    poll()
    const id = setInterval(poll, 45000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [serverId])

  if (!players) return null
  if (players.length === 0) return null

  return (
    <div className="onlineplayers">
      <h4 className="onlineplayers__title">
        <span className="onlineplayers__dot" />
        Online now ({players.length})
      </h4>
      <ul className="onlineplayers__list">
        {players.slice(0, 12).map((p, i) => {
          const href = p.member ? `/u/${p.member.key}` : p.steamId ? `/p/${p.steamId}` : null
          const name = p.member?.username || p.name
          return (
            <li className="onlineplayers__item" key={i}>
              {href ? (
                <a className="onlineplayers__name" {...linkProps(href)}>
                  {name}
                </a>
              ) : (
                <span className="onlineplayers__name">{name}</span>
              )}
              {p.time != null && (
                <span className="onlineplayers__time">{timeAgo(p.time)}</span>
              )}
            </li>
          )
        })}
        {players.length > 12 && (
          <li className="onlineplayers__more">+{players.length - 12} more</li>
        )}
      </ul>
    </div>
  )
}
