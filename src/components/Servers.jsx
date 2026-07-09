import { servers } from '../data/servers.js'
import { useServerStatuses, displayState } from '../hooks/useServerStatus.js'
import ServerCard from './ServerCard.jsx'

// At-a-glance live status for every server, shown at the top of the section so a
// visitor sees who's online / full without scrolling down to each card. Clicking a
// chip jumps to that server's card.
function ServerStatusStrip({ statuses }) {
  const CHIP = {
    loading: ['Checking…', 'sstrip__chip--loading'],
    online: ['Online', 'sstrip__chip--online'],
    full: ['Full', 'sstrip__chip--full'],
    offline: ['Offline', 'sstrip__chip--offline'],
    unknown: ['Unknown', 'sstrip__chip--unknown'],
  }
  return (
    <div className="sstrip" role="status" aria-label="Live server status">
      {servers.map((s) => {
        const status = statuses[s.id] || { state: 'loading' }
        const state = displayState(status)
        const [label, cls] = CHIP[state] || CHIP.unknown
        const showCount = state === 'online' || state === 'full'
        return (
          <a key={s.id} className={`sstrip__chip ${cls}`} href={`#server-${s.id}`}>
            <span className="sstrip__dot" />
            <span className="sstrip__name">{s.name}</span>
            <span className="sstrip__state">
              {label}
              {showCount && ` · ${status.players}/${status.maxPlayers}`}
            </span>
          </a>
        )
      })}
    </div>
  )
}

export default function Servers() {
  const statuses = useServerStatuses(servers)

  return (
    <section className="section" id="servers">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Our servers</p>
          <h2 className="section__title">Pick your battleground</h2>
          <p className="section__lead">
            Live player counts update automatically. Copy the IP or hit connect and you're in.
          </p>
        </div>

        <ServerStatusStrip statuses={statuses} />

        <div className="grid">
          {servers.map((s) => (
            <ServerCard key={s.id} server={s} status={statuses[s.id]} />
          ))}
        </div>
      </div>
    </section>
  )
}
