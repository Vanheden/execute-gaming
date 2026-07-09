import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function KillFeed() {
  const [kills, setKills] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let live = true
    const poll = () => {
      fetch('/api/kills/recent?limit=15')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          if (!live) return
          setKills(d.kills || [])
          setError(false)
        })
        .catch(() => {
          if (!live) return
          setKills([])
          setError(true)
        })
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])

  if (error || !kills?.length) return null

  return (
    <div className="killfeed">
      <h3 className="killfeed__title">
        <span className="killfeed__pulse" aria-hidden="true" />
        Live Kill Feed
      </h3>
      <ul className="killfeed__list">
        {kills.map((k, i) => {
          const href = k.member ? `/u/${k.member.key}` : `/p/${k.steamId}`
          const isVBlood = k.kind === 'vblood'
          return (
            <li className="killfeed__item" key={i}>
              <span className={`killfeed__icon ${isVBlood ? 'killfeed__icon--vb' : 'killfeed__icon--pvp'}`}>
                {isVBlood ? '🩸' : '⚔️'}
              </span>
              <span className="killfeed__text">
                <a className="killfeed__name" {...linkProps(href)}>
                  {k.charName}
                </a>{' '}
                <span className="killfeed__verb">{isVBlood ? 'felled' : 'defeated'}</span>{' '}
                <span className={`killfeed__victim ${isVBlood ? 'killfeed__victim--vb' : 'killfeed__victim--pvp'}`}>
                  {k.victim || (isVBlood ? 'V Blood boss' : 'a rival')}
                </span>
              </span>
              <span className="killfeed__time">{timeAgo(k.occurredAt)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
