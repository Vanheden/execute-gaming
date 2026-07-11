import { useEffect, useState, useMemo } from 'react'
import { servers } from '../data/servers.js'
import { VBLOOD_NAMES } from '../data/vbloods.js'
import { linkProps } from '../lib/router.js'
import WorldFirsts from './WorldFirsts.jsx'

const ALL_BOSSES = Object.entries(VBLOOD_NAMES).map(([guid, name]) => ({ guid, name }))
const SERVER_TABS = [['', 'All servers'], ...servers.map((s) => [s.id, s.name])]

export default function VBloodHunt() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [serverId, setServerId] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let live = true
    setData(null)
    setError(false)
    const params = new URLSearchParams()
    if (serverId) params.set('serverId', serverId)
    fetch(`/api/vblood-hunt?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d))
      .catch(() => {
        if (!live) return
        setData(null)
        setError(true)
      })
    return () => {
      live = false
    }
  }, [serverId])

  const filtered = useMemo(() => {
    if (!data?.players) return []
    const q = search.trim().toLowerCase()
    if (!q) return data.players
    return data.players.filter((p) => p.charName.toLowerCase().includes(q))
  }, [data, search])

  const totalBosses = data?.totalBosses || ALL_BOSSES.length

  return (
    <section className="section section--alt" id="vblood-hunt">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Boss progression</p>
          <h2 className="section__title">V Blood Hunt Tracker</h2>
          <p className="section__lead">
            {data
              ? `${data.players.length} hunters have felled ${totalBosses} possible V Blood bosses. See who's closest to a full clear.`
              : 'Loading hunt progress…'}
          </p>
        </div>

        <div className="mfilter__tabs">
          {SERVER_TABS.map(([val, label]) => (
            <button
              key={val || 'all'}
              className={`mfilter__tab ${serverId === val ? 'mfilter__tab--on' : ''}`}
              onClick={() => setServerId(val)}
            >
              {label}
            </button>
          ))}
        </div>

        <WorldFirsts serverId={serverId} />

        {error && <p className="empty">Failed to load hunt data. Try again later.</p>}

        {data && (
          <>
            <input
              className="hunt__search"
              type="text"
              placeholder="Search player…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="hunt__grid">
              {filtered.map((p) => {
                const bossSet = new Set(p.bosses)
                const pct = Math.round((p.count / totalBosses) * 100)
                const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
                return (
                  <div className="hunt__card" key={p.steamId}>
                    <div className="hunt__head">
                      <a className="hunt__name" {...linkProps(href)}>
                        {p.charName}
                      </a>
                      <span className="hunt__count">
                        {p.count}/{totalBosses}
                      </span>
                    </div>
                    <div className="hunt__bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <div className="hunt__bosses">
                      {ALL_BOSSES.map((b) => (
                        <span
                          key={b.guid}
                          className={`hunt__boss ${bossSet.has(b.guid) ? 'hunt__boss--done' : ''}`}
                          title={bossSet.has(b.guid) ? `${b.name} ✓` : b.name}
                        >
                          {bossSet.has(b.guid) ? '🩸' : '○'}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
