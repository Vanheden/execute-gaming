import { useEffect, useState } from 'react'
import { servers, community } from '../data/servers.js'
import { linkProps } from '../lib/router.js'
import Badges from './Badges.jsx'

function serverName(id) {
  return servers.find((s) => s.id === id)?.name || id
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PublicProfile({ profileKey }) {
  const [state, setState] = useState({ status: 'loading', member: null })

  useEffect(() => {
    let live = true
    setState({ status: 'loading', member: null })
    fetch(`/api/profile/${encodeURIComponent(profileKey)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setState({ status: 'ok', member: d.member }))
      .catch(() => live && setState({ status: 'notfound', member: null }))
    return () => {
      live = false
    }
  }, [profileKey])

  const m = state.member

  useEffect(() => {
    document.title = m ? `${m.username} · ${community.name}` : community.name
    return () => {
      document.title = community.name
    }
  }, [m])

  return (
    <div className="pubprofile">
      <header className={`nav nav--scrolled`}>
        <div className="nav__inner container">
          <a className="nav__brand" {...linkProps('/')}>
            <img className="nav__logo" src="/logo.svg" alt="" aria-hidden="true" />
            <span>{community.name}</span>
          </a>
          <a className="btn btn--ghost btn--sm" {...linkProps('/')}>
            ← Back to site
          </a>
        </div>
      </header>

      <main className="container pubprofile__main">
        {state.status === 'loading' && <p className="empty">Loading profile…</p>}

        {state.status === 'notfound' && (
          <div className="pubprofile__missing">
            <h1 className="section__title">Profile not found</h1>
            <p className="section__lead">This member doesn't exist, or their profile is unavailable.</p>
            <a className="btn" {...linkProps('/')}>
              Back to the community
            </a>
          </div>
        )}

        {state.status === 'ok' && m && (
          <article className="pubcard">
            <div className="pubcard__head">
              {m.avatar ? (
                <img className="pubcard__avatar" src={m.avatar} alt="" />
              ) : (
                <span className="pubcard__avatar pubcard__avatar--ph">
                  {m.username?.[0]?.toUpperCase() || '?'}
                </span>
              )}
              <div>
                <h1 className="pubcard__name">
                  {m.username}
                  {m.role === 'admin' && <span className="badge badge--admin">Admin</span>}
                </h1>
                <div className="pubcard__sub">
                  <span className={`provider provider--${m.provider}`}>
                    {m.provider === 'discord' ? 'Discord' : m.provider === 'steam' ? 'Steam' : m.provider}
                  </span>
                  {m.rank && <span className="pubcard__rank">Member #{m.rank}</span>}
                  <span className="pubcard__since">Since {formatDate(m.createdAt)}</span>
                </div>
              </div>
            </div>

            {m.badges?.length > 0 && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Achievements</h2>
                <Badges badges={m.badges} />
              </section>
            )}

            <section className="pubcard__section">
              <h2 className="pubcard__label">About</h2>
              <p className="pubcard__bio">
                {m.bio || <span className="pf__bio--empty">This member hasn't written a bio yet.</span>}
              </p>
              {m.favoriteServer && (
                <p className="pubcard__fav">★ Favourite server: {serverName(m.favoriteServer)}</p>
              )}
            </section>

            {m.discordRoles?.some((r) => r.name) && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Discord roles</h2>
                <div className="mroster__roles">
                  {m.discordRoles
                    .filter((r) => r.name)
                    .map((r) => (
                      <span key={r.id} className="rtag" style={r.color ? { '--rc': r.color } : undefined}>
                        {r.name}
                      </span>
                    ))}
                </div>
              </section>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
