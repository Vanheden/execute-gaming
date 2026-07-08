import { community, servers } from '../data/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'

export default function Hero() {
  const { user } = useAuth()

  return (
    <section className="hero" id="top">
      <div className="hero__glow" aria-hidden="true" />
      <div className="container hero__inner">
        <img className="hero__logo" src="/logo.svg" alt={`${community.name} logo`} />
        <p className="hero__eyebrow">
          {user ? `Welcome back, ${user.username} 👋` : `Welcome to ${community.name}`}
        </p>
        <h1 className="hero__title">
          Play. Compete. <span className="text-accent">Belong.</span>
        </h1>
        <p className="hero__lead">
          A home for V Rising players. Jump into our Easy PvE and Duo PvP servers, team up
          with the community, and build something legendary.
        </p>
        <div className="hero__actions">
          <a className="btn btn--lg" href="#servers">
            Browse servers
          </a>
          <a className="btn btn--ghost btn--lg" href={community.discord} target="_blank" rel="noreferrer">
            Join our Discord
          </a>
        </div>

        <dl className="hero__stats">
          <div>
            <dt>Servers</dt>
            <dd>{servers.length}</dd>
          </div>
          <div>
            <dt>Games</dt>
            <dd>{new Set(servers.map((s) => s.game)).size}</dd>
          </div>
          <div>
            <dt>Vibe</dt>
            <dd>24/7</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}
