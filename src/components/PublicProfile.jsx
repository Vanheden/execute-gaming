import { useEffect, useState } from 'react'
import { servers, community } from '../data/servers.js'
import { rankForPoints } from '../data/ranks.js'
import { linkProps } from '../lib/router.js'
import Badges from './Badges.jsx'
import ActivityHeatmap from './ActivityHeatmap.jsx'
import Rivalries from './Rivalries.jsx'

function serverName(id) {
  return servers.find((s) => s.id === id)?.name || id
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// The headline rank card: tier icon + name, points, and progress to the next tier.
function RankBox({ points }) {
  const { tier, next, progressPct, toNext, isMax } = rankForPoints(points)
  return (
    <div className="rankbox" style={{ '--rank': tier.color }}>
      <span className="rankbox__icon" aria-hidden="true">
        {tier.icon}
      </span>
      <div className="rankbox__body">
        <div className="rankbox__top">
          <span className="rankbox__name">{tier.name}</span>
          <span className="rankbox__pts">{points.toLocaleString()} pts</span>
        </div>
        <div className="rankbox__bar">
          <span style={{ width: `${progressPct}%` }} />
        </div>
        <span className="rankbox__next">
          {isMax ? 'Max rank — apex predator of the night' : `${toNext.toLocaleString()} pts to ${next.name}`}
        </span>
      </div>
    </div>
  )
}

// A compact per-server rank row: server name + its rank pill + points on that server.
function ServerRank({ name, accent, points }) {
  const { tier } = rankForPoints(points)
  return (
    <div className="ranksrv" style={{ '--rank': tier.color, '--srv': accent }}>
      <span className="ranksrv__server">{name}</span>
      <span className="ranksrv__pill">
        <span className="ranksrv__icon" aria-hidden="true">
          {tier.icon}
        </span>
        {tier.name}
      </span>
      <span className="ranksrv__pts">{points.toLocaleString()} pts</span>
    </div>
  )
}

// Rank section: the global (all-server) rank as the headline, plus a per-server
// breakdown for every server the member has actually earned points on. Only shown
// when the member has a Steam link (points is an object with an `overall` total).
function RankBadge({ points }) {
  const active = (points.perServer || []).filter((s) => s.points > 0)
  return (
    <section className="pubcard__section">
      <h2 className="pubcard__label">Rank</h2>
      <RankBox points={points.overall} />
      {active.length > 0 && (
        <div className="rankservers">
          <span className="rankservers__label">By server</span>
          {active.map((s) => (
            <ServerRank key={s.serverId} name={s.name} accent={s.accent} points={s.points} />
          ))}
        </div>
      )}
    </section>
  )
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

            {m.points && typeof m.points.overall === 'number' && <RankBadge points={m.points} />}

            {m.steamId && <Rivalries steamId={m.steamId} />}

            {m.steamId && <ActivityHeatmap steamId={m.steamId} />}

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
