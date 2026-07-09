import { useEffect, useMemo, useState } from 'react'
import { servers } from '../data/servers.js'
import { linkProps } from '../lib/router.js'

// Human-readable playtime, e.g. 5400s → "1h 30m".
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

const PERIODS = [
  ['all', 'All time'],
  ['30d', 'Last 30 days'],
  ['7d', 'Last 7 days'],
]

// Server filter tabs: "All servers" + one per configured server.
const SERVER_TABS = [['', 'All servers'], ...servers.map((s) => [s.id, s.name])]

// Bat silhouette — the placeholder for players without a linked avatar.
function Bat() {
  return (
    <svg className="lb__bat" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8.2c0 0-.8-2.2-2.2-2.2 0 0 .5.9.4 1.6 0 0-1.6-2.2-4.6-1.2 0 0 1 .5 1.2 1.2
           0 0-2.8-.4-4.4 2.2 0 0 1.9-.4 2.8.1 0 0-1.8 1.1-1.6 3.5 0 0 2-2.2 4.4-1.2 2 .8 3 2.2 4 4
           1-1.8 2-3.2 4-4 2.4-1 4.4 1.2 4.4 1.2.2-2.4-1.6-3.5-1.6-3.5.9-.5 2.8-.1 2.8-.1
           -1.6-2.6-4.4-2.2-4.4-2.2.2-.7 1.2-1.2 1.2-1.2-3-1-4.6 1.2-4.6 1.2-.1-.7.4-1.6.4-1.6C12.8 6 12 8.2 12 8.2Z"
      />
    </svg>
  )
}

function Avatar({ e }) {
  if (e.member?.avatar) return <img className="lb__avatar" src={e.member.avatar} alt="" loading="lazy" />
  return (
    <span className="lb__avatar lb__avatar--ph" title={e.name} aria-label={e.name}>
      <Bat />
    </span>
  )
}

function Name({ e }) {
  // Linked members deep-link to their public profile; unlinked players are plain text.
  if (e.member)
    return (
      <a className="lb__name lb__name--link" {...linkProps(`/u/${e.member.key}`)}>
        {e.name}
        {e.member.role === 'admin' && <span className="badge badge--admin">Admin</span>}
      </a>
    )
  return <span className="lb__name">{e.name}</span>
}

export default function Leaderboard() {
  const [entries, setEntries] = useState(null)
  const [period, setPeriod] = useState('all')
  const [serverId, setServerId] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    setEntries(null)
    setError(false)
    const params = new URLSearchParams({ period })
    if (serverId) params.set('serverId', serverId)
    fetch(`/api/leaderboard?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntries(d.entries || []))
      .catch(() => {
        setEntries([])
        setError(true)
      })
  }, [period, serverId])

  const total = entries?.length || 0
  const maxSeconds = useMemo(() => entries?.[0]?.seconds || 0, [entries])

  return (
    <section className="section section--alt" id="leaderboard">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Rise to the top</p>
          <h2 className="section__title">Playtime leaderboard</h2>
          <p className="section__lead">
            {entries === null
              ? 'Loading the ladder…'
              : error
                ? 'The leaderboard is warming up — check back once sessions are tracked.'
                : total === 0
                  ? 'No tracked playtime yet. Hop on a server and start climbing!'
                  : 'Ranked by total time spent on our V Rising servers.'}
          </p>
        </div>

        <div className="lbfilter">
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
          <div className="mfilter__tabs">
            {PERIODS.map(([val, label]) => (
              <button
                key={val}
                className={`mfilter__tab ${period === val ? 'mfilter__tab--on' : ''}`}
                onClick={() => setPeriod(val)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {entries && total > 0 && (
          <ol className="lb">
            {entries.map((e, i) => (
              <li className={`lb__row ${i < 3 ? 'lb__row--top' : ''}`} key={e.steamId}>
                <span className={`lb__rank lb__rank--${i + 1}`}>#{i + 1}</span>
                <Avatar e={e} />
                <div className="lb__info">
                  <Name e={e} />
                  <span className="lb__meta">
                    {e.sessions} session{e.sessions === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="lb__time">
                  <span className="lb__hours">{formatDuration(e.seconds)}</span>
                  <span
                    className="lb__bar"
                    style={{ '--pct': `${maxSeconds ? (e.seconds / maxSeconds) * 100 : 0}%` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
