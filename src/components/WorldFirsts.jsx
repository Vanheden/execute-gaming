import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'
import { servers } from '../data/servers.js'

// -------------------------------------------------------------------------
// WorldFirsts — the "Hall of Fame": the first hunter to fell each V Blood boss
// this season (per server). Announced in-game the moment it happens; here it's
// a lasting record. Respects the hunt page's server filter. Hidden when empty.
// -------------------------------------------------------------------------

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

const SERVER_NAMES = Object.fromEntries(servers.map((s) => [s.id, s.name]))

export default function WorldFirsts({ serverId = '' }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (serverId) params.set('serverId', serverId)
    fetch(`/api/records?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRows(d.worldFirsts || []))
      .catch(() => setRows([]))
  }, [serverId])

  if (!rows || rows.length === 0) return null

  return (
    <div className="worldfirsts">
      <div className="worldfirsts__head">
        <h3 className="worldfirsts__title">🏆 Hall of Fame</h3>
        <span className="worldfirsts__sub">First to fell each V Blood this season.</span>
      </div>
      <ul className="worldfirsts__grid">
        {rows.map((r) => {
          const href = r.member ? `/u/${r.member.key}` : `/p/${r.steamId}`
          return (
            <li className="worldfirsts__item" key={`${r.serverId}:${r.bossGuid}`}>
              <span className="worldfirsts__boss">{r.boss || 'V Blood boss'}</span>
              <span className="worldfirsts__meta">
                <a className="worldfirsts__who" {...linkProps(href)} title={r.name}>
                  {r.name}
                </a>
                {!serverId && SERVER_NAMES[r.serverId] && (
                  <span className="worldfirsts__server"> · {SERVER_NAMES[r.serverId]}</span>
                )}
                <span className="worldfirsts__time"> · {timeAgo(r.occurredAt)}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
