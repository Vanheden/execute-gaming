import { useEffect, useState } from 'react'
import { community, servers } from '../data/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import HeroLadder from './HeroLadder.jsx'

export default function Hero() {
  const { user } = useAuth()
  const [stats, setStats] = useState(null)

  // Live community aggregates so the hero sells the activity, not vanity numbers.
  useEffect(() => {
    let live = true
    fetch('/api/global-stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setStats(d?.stats || null))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const num = (n) => (n == null ? '—' : n.toLocaleString())

  return (
    <section className="hero" id="top">
      <div className="hero__glow" aria-hidden="true" />
      <div className="hero__scene" aria-hidden="true" />
      <div className="hero__embers" aria-hidden="true" />
      <div className="container hero__inner">
        <div className="hero__copy">
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
              <dt>Vampires</dt>
              <dd>{num(stats?.players)}</dd>
            </div>
            <div>
              <dt>V Bloods felled</dt>
              <dd>{num(stats?.vblood)}</dd>
            </div>
            <div>
              <dt>PvP kills</dt>
              <dd>{num(stats?.pvp)}</dd>
            </div>
          </dl>
        </div>

        <HeroLadder />
      </div>
    </section>
  )
}
