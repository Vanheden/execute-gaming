import { useEffect, useMemo, useState } from 'react'
import { servers } from '../data/servers.js'
import { linkProps } from '../lib/router.js'

// Clan leaderboard (/clans). Ranks clans (keyed by their stable ClanGuid, shown
// under the latest captured name) by the same metrics as the player ladder. Each
// row links to that clan's profile at /c/:clanGuid. Data: GET /api/clans.

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h === 0 ? `${m}m` : `${h}h ${m}m`
}

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

const MEDALS = ['🥇', '🥈', '🥉']
const SERVER_TABS = [['', 'All servers'], ...servers.map((s) => [s.id, s.name])]
const SERVER_BY_ID = Object.fromEntries(servers.map((s) => [s.id, s]))
const shortServerName = (name) => name.replace(/^.*—\s*/, '')

// Crest placeholder — the clan's first letter on a themed disc.
function Crest({ name }) {
  return (
    <span className="clan__crest" aria-hidden="true">
      {name?.[0]?.toUpperCase() || '⚔'}
    </span>
  )
}

function ClanSkeleton() {
  return (
    <ol className="lb lb--skel" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li className="lb__row" key={i}>
          <span className="sk sk--rank" />
          <span className="sk sk--avatar" />
          <div className="lb__info">
            <span className="sk sk--line" style={{ width: '34%' }} />
            <span className="sk sk--line sk--sm" style={{ width: '52%' }} />
          </div>
          <div className="lb__time">
            <span className="sk sk--line" style={{ width: '58px' }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function ClanLeaderboard() {
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
    fetch(`/api/clans?${params}`)
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
    <section className="section section--alt" id="clans">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Blood runs thicker</p>
          <h2 className="section__title">Clan Leaderboard</h2>
          <p className="section__lead">
            {entries === null
              ? 'Loading the clans…'
              : error
                ? 'Clan stats are warming up — check back once clans start playing.'
                : total === 0
                  ? 'No clan activity tracked yet. Form a clan in-game and start climbing!'
                  : metric === 'points'
                    ? 'Clans ranked by combined points: playtime, V Blood and PvP kills of all members.'
                    : `Clans ranked by total ${active.label.toLowerCase()} across their members.`}
          </p>
        </div>

        <div className="lbfilter">
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

        {entries === null && <ClanSkeleton />}

        {entries && total > 0 && (
          <ol className="lb">
            {entries.map((e, rank) => {
              const srv = SERVER_BY_ID[e.serverId]
              return (
                <li
                  className={`lb__row ${rank < 3 ? `lb__row--top lb__row--${rank + 1}` : ''}`}
                  key={e.clanGuid}
                >
                  <span className={`lb__rank lb__rank--${rank + 1}`}>
                    {rank < 3 ? <span className="lb__medal">{MEDALS[rank]}</span> : `#${rank + 1}`}
                  </span>
                  <Crest name={e.clanName} />
                  <div className="lb__info">
                    <div className="lb__nameline">
                      <a className="lb__name lb__name--link" {...linkProps(`/c/${e.clanGuid}`)}>
                        {e.clanName}
                      </a>
                      {srv && (
                        <span className="lb__server" style={{ '--srv': srv.accent }} title={srv.name}>
                          <span className="lb__serverdot" aria-hidden="true" />
                          {shortServerName(srv.name)}
                        </span>
                      )}
                    </div>
                    <span className="lb__meta">
                      {e.members} member{e.members === 1 ? '' : 's'}
                      {' · '}
                      <span className="lb__vb">
                        <span className="lb__num">{e.vblood}</span> V Blood
                      </span>
                      {' · '}
                      <span className="lb__pvp">
                        <span className="lb__num">{e.pvp}</span> PvP
                      </span>
                    </span>
                  </div>
                  <div className="lb__time">
                    <div className="lb__valrow">
                      <span className="lb__hours">{active.render(e)}</span>
                    </div>
                    <span
                      className="lb__bar"
                      style={{ '--pct': `${maxValue ? (active.value(e) / maxValue) * 100 : 0}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
