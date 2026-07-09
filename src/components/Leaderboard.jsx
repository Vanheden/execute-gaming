import { useEffect, useMemo, useState } from 'react'
import { servers } from '../data/servers.js'
import { rankForPoints } from '../data/ranks.js'
import { linkProps } from '../lib/router.js'
import KillFeed from './KillFeed.jsx'
import SeasonChampions from './SeasonChampions.jsx'
import WeeklyHighlights from './WeeklyHighlights.jsx'

// Human-readable playtime, e.g. 5400s → "1h 30m".
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

// Same duration, but with white numbers and theme-accent unit letters (h/m).
function PlaytimeParts({ seconds }) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return (
    <span className="lb__pt">
      {h > 0 && (
        <>
          <span className="lb__num">{h}</span>
          <span className="lb__unit">h</span>{' '}
        </>
      )}
      <span className="lb__num">{m}</span>
      <span className="lb__unit">m</span>
    </span>
  )
}

// The rankable metrics. `value` pulls the ranked number off a row; `render` turns
// it into the big label shown on the right of each row.
const METRICS = [
  { id: 'points', label: 'Points', value: (e) => e.points, render: (e) => `${e.points.toLocaleString()} pts` },
  { id: 'playtime', label: 'Playtime', value: (e) => e.seconds, render: (e) => formatDuration(e.seconds) },
  {
    id: 'vblood',
    label: 'V Blood',
    value: (e) => e.vblood,
    render: (e) => (
      <>
        <span className="lb__num">{e.vblood}</span>{' '}
        <span className="lb__vb">V Blood{e.vblood === 1 ? '' : 's'}</span>
      </>
    ),
  },
  {
    id: 'pvp',
    label: 'PvP kills',
    value: (e) => e.pvp,
    render: (e) => (
      <>
        <span className="lb__num">{e.pvp}</span>{' '}
        <span className="lb__pvp">kill{e.pvp === 1 ? '' : 's'}</span>
      </>
    ),
  },
]

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

// Coloured rank pill derived from the player's all-time points (persistent across
// the period/server filters). See src/data/ranks.js for the ladder.
function Rank({ e }) {
  const points = e.allTimePoints ?? e.points ?? 0
  const { tier } = rankForPoints(points)
  return (
    <span className="lb__rankpill" style={{ '--rank': tier.color }} title={`${tier.name} · ${points.toLocaleString()} pts`}>
      <span className="lb__rankicon" aria-hidden="true">
        {tier.icon}
      </span>
      {tier.name}
    </span>
  )
}

function Name({ e }) {
  // All players are clickable. Registered members link to their full profile
  // (/u/:key); unregistered players link to their game-stats page (/p/:steamId).
  const href = e.member ? `/u/${e.member.key}` : `/p/${e.steamId}`
  return (
    <a className="lb__name lb__name--link" {...linkProps(href)}>
      {e.name}
      {e.member?.role === 'admin' && <span className="badge badge--admin">Admin</span>}
      {!e.member && <span className="badge badge--guest">Guest</span>}
    </a>
  )
}

// Secondary line under the name. On the Points tab, show the full breakdown that
// earned those points; on the single-metric tabs, a lighter context line.
function Meta({ e, metric }) {
  if (metric === 'points')
    return (
      <span className="lb__meta">
        <PlaytimeParts seconds={e.seconds} />
        {' · '}
        <span className="lb__vb">
          <span className="lb__num">{e.vblood}</span> V Blood
        </span>
        {' · '}
        <span className="lb__pvp">
          <span className="lb__num">{e.pvp}</span> PvP
        </span>
      </span>
    )
  if (metric === 'playtime')
    return (
      <span className="lb__meta">
        {e.sessions} session{e.sessions === 1 ? '' : 's'}
      </span>
    )
  // vblood / pvp tabs: show total playtime as context.
  return (
    <span className="lb__meta">
      <PlaytimeParts seconds={e.seconds} /> played
    </span>
  )
}

// The most recent V Blood boss this player felled, e.g. "Latest: Alpha Wolf".
// Unknown bosses (a PrefabGUID we haven't mapped) show a neutral label — never a guess.
function LatestKill({ e }) {
  if (!e.latestVBlood) return null
  const { name } = e.latestVBlood
  return (
    <span className="lb__latest">
      Latest Kill: <span className="lb__vb">{name || 'V Blood boss'}</span>
    </span>
  )
}

export default function Leaderboard() {
  const [entries, setEntries] = useState(null)
  const [metric, setMetric] = useState('points')
  const [period, setPeriod] = useState('all')
  const [serverId, setServerId] = useState('')
  const [error, setError] = useState(false)

  const active = METRICS.find((m) => m.id === metric) || METRICS[0]

  useEffect(() => {
    setEntries(null)
    setError(false)
    const params = new URLSearchParams({ metric, period })
    if (serverId) params.set('serverId', serverId)
    fetch(`/api/leaderboard?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntries(d.entries || []))
      .catch(() => {
        setEntries([])
        setError(true)
      })
  }, [metric, period, serverId])

  const total = entries?.length || 0
  const maxValue = useMemo(() => (entries?.length ? active.value(entries[0]) : 0), [entries, active])

  return (
    <section className="section section--alt" id="leaderboard">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Rise to the top</p>
          <h2 className="section__title">Leaderboard</h2>
          <p className="section__lead">
            {entries === null
              ? 'Loading the ladder…'
              : error
                ? 'The leaderboard is warming up — check back once sessions are tracked.'
                : total === 0
                  ? 'No tracked activity yet. Hop on a server and start climbing!'
                  : metric === 'points'
                    ? 'Ranked by points: playtime, V Blood kills and PvP kills combined.'
                    : `Ranked by ${active.label.toLowerCase()} on our V Rising servers.`}
          </p>
        </div>

        <div className="lb-layout">
          <aside className="lb-sidebar">
            <WeeklyHighlights />
          </aside>
          <div className="lb-main">
            <div className="lbfilter">
              <SeasonChampions />
              <KillFeed serverId={serverId} />
          <div className="mfilter__tabs lbfilter__metrics">
            {METRICS.map((m) => (
              <button
                key={m.id}
                className={`mfilter__tab ${metric === m.id ? 'mfilter__tab--on' : ''}`}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
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
              <li className={`lb__row ${i < 3 ? `lb__row--top lb__row--${i + 1}` : ''}`} key={e.steamId}>
                <span className={`lb__rank lb__rank--${i + 1}`}>
                  {i < 3 ? <span className="lb__medal">{'🥇🥈🥉'[i]}</span> : `#${i + 1}`}
                </span>
                <Avatar e={e} />
                <div className="lb__info">
                  <div className="lb__nameline">
                    <Name e={e} />
                    <Rank e={e} />
                  </div>
                  <Meta e={e} metric={metric} />
                  <LatestKill e={e} />
                </div>
                <div className="lb__time">
                  <span className="lb__hours">{active.render(e)}</span>
                  <span
                    className="lb__bar"
                    style={{ '--pct': `${maxValue ? (active.value(e) / maxValue) * 100 : 0}%` }}
                    aria-hidden="true"
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
          </div>
        </div>
      </div>
    </section>
  )
}
