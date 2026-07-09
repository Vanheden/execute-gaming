import { useState } from 'react'
import { displayState } from '../hooks/useServerStatus.js'
import PlayerHistoryChart from './PlayerHistoryChart.jsx'

function StatusPill({ state }) {
  const map = {
    loading: ['Checking…', 'pill--loading'],
    online: ['Online', 'pill--online'],
    full: ['Full', 'pill--full'],
    offline: ['Offline', 'pill--offline'],
    unknown: ['Unknown', 'pill--unknown'],
  }
  const [label, cls] = map[state] || map.unknown
  return (
    <span className={`pill ${cls}`}>
      <span className="pill__dot" /> {label}
    </span>
  )
}

function ServerDetails({ server }) {
  const d = server.details
  return (
    <div className="sd">
      {d.info && <p className="sd__info">{d.info}</p>}

      <dl className="sd__meta">
        <div><dt>Rates</dt><dd>{d.rates}</dd></div>
        <div><dt>Wipe</dt><dd>{d.wipe}</dd></div>
        <div><dt>Mods</dt><dd>{d.mods}</dd></div>
        <div><dt>Connect</dt><dd><code>{server.ip}</code></dd></div>
      </dl>

      {server.battlemetricsId && <PlayerHistoryChart server={server} />}

      <h4 className="sd__rulesh">Rules</h4>
      <ul className="sd__rules">
        {d.rules.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

export default function ServerCard({ server, status = { state: 'loading', players: 0, maxPlayers: server.maxPlayers } }) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(true) // details shown by default

  const copyIp = async () => {
    try {
      await navigator.clipboard.writeText(server.ip)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const fillPct =
    status.maxPlayers > 0 ? Math.min(100, (status.players / status.maxPlayers) * 100) : 0

  return (
    <article id={`server-${server.id}`} className="card" style={{ '--accent': server.accent }}>
      <div className="card__media">
        <img src={server.image} alt={server.name} loading="lazy" />
        <div className="card__media-overlay" />
        <span className="card__game">{server.game}</span>
        <StatusPill state={displayState(status)} />
      </div>

      <div className="card__body">
        <div className="card__head">
          <h3 className="card__title">{server.name}</h3>
          <span className="card__mode">{server.mode}</span>
        </div>
        <p className="card__tagline">{server.tagline}</p>

        <div className="card__players">
          <div className="card__players-row">
            <span>
              {status.state === 'loading' ? '—' : status.players} / {server.maxPlayers} players
            </span>
            {status.map && <span className="card__map">{status.map}</span>}
          </div>
          <div className="card__bar">
            <div className="card__bar-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>

        <div className="card__tags">
          {server.tags.map((t) => (
            <span key={t} className="tag">
              {t}
            </span>
          ))}
        </div>

        <div className="card__actions">
          {server.connect ? (
            <a className="btn btn--sm" href={server.connect}>
              Connect
            </a>
          ) : null}
          <button className="btn btn--ghost btn--sm" onClick={copyIp}>
            {copied ? 'Copied!' : `Copy IP`}
          </button>
        </div>
        <code className="card__ip">{server.ip}</code>

        {server.details && (
          <>
            <button
              className="card__details"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
            >
              {open ? 'Hide details ▲' : 'Rules & details ▼'}
            </button>
            {open && <ServerDetails server={server} />}
          </>
        )}
      </div>
    </article>
  )
}
