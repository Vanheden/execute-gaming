import { servers } from '../data/servers.js'
import ServerCard from './ServerCard.jsx'

export default function Servers() {
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

        <div className="grid">
          {servers.map((s) => (
            <ServerCard key={s.id} server={s} />
          ))}
        </div>
      </div>
    </section>
  )
}
