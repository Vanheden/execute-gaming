import { useEffect, useState } from 'react'
import { community } from '../data/servers.js'
import { rankForPoints } from '../data/ranks.js'
import { linkProps } from '../lib/router.js'
import ActivityHeatmap from './ActivityHeatmap.jsx'
import Rivalries from './Rivalries.jsx'
import ServerSplit from './ServerSplit.jsx'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

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

function ServerStat({ name, accent, seconds, sessions, vblood, pvp, points }) {
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
      <span className="ranksrv__pts">
        {formatDuration(seconds)} · {vblood} V Blood · {pvp} PvP
      </span>
    </div>
  )
}

export default function PlayerProfile({ steamId }) {
  const [state, setState] = useState({ status: 'loading', player: null })

  useEffect(() => {
    let live = true
    setState({ status: 'loading', player: null })
    fetch(`/api/player/${encodeURIComponent(steamId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setState({ status: 'ok', player: d.player }))
      .catch(() => live && setState({ status: 'notfound', player: null }))
    return () => {
      live = false
    }
  }, [steamId])

  const p = state.player

  useEffect(() => {
    document.title = p ? `${p.charName || 'Unknown vampire'} · ${community.name}` : community.name
    return () => {
      document.title = community.name
    }
  }, [p])

  return (
    <div className="pubprofile">
      <header className={`nav nav--scrolled`}>
        <div className="nav__inner container">
          <a className="nav__brand" {...linkProps('/')}>
            <img className="nav__logo" src="/logo.svg" alt="" aria-hidden="true" />
            <span>{community.name}</span>
          </a>
          <a className="btn btn--ghost btn--sm" {...linkProps('/leaderboard')}>
            ← Back to leaderboard
          </a>
        </div>
      </header>

      <main className="container pubprofile__main">
        {state.status === 'loading' && <p className="empty">Loading profile…</p>}

        {state.status === 'notfound' && (
          <div className="pubprofile__missing">
            <h1 className="section__title">Player not found</h1>
            <p className="section__lead">This player has no tracked activity on our servers.</p>
            <a className="btn" {...linkProps('/leaderboard')}>
              Back to the leaderboard
            </a>
          </div>
        )}

        {state.status === 'ok' && p && (
          <article className="pubcard">
            <div className="pubcard__head">
              <span className="pubcard__avatar pubcard__avatar--ph">
                {(p.charName || '?')[0]?.toUpperCase()}
              </span>
              <div>
                <h1 className="pubcard__name">
                  {p.charName || 'Unknown vampire'}
                  <span className="badge badge--guest">Guest</span>
                </h1>
                <div className="pubcard__sub">
                  <span className="pubcard__rank">Unregistered player</span>
                  {p.lastSeen && <span className="pubcard__since">Last seen {formatDate(p.lastSeen)}</span>}
                </div>
              </div>
            </div>

            {p.member && (
              <div className="pubcard__linked">
                This player is registered as{' '}
                <a className="pubcard__link" {...linkProps(`/u/${p.member.key}`)}>
                  {p.member.username}
                </a>
                {' — '}
                <a className="pubcard__link" {...linkProps(`/u/${p.member.key}`)}>
                  View full profile →
                </a>
              </div>
            )}

            <RankBox points={p.points} />

            <section className="pubcard__section">
              <h2 className="pubcard__label">Stats</h2>
              <div className="pstats">
                <div className="pstats__item">
                  <span className="pstats__num">{formatDuration(p.seconds)}</span>
                  <span className="pstats__label">Playtime</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{p.sessions}</span>
                  <span className="pstats__label">Sessions</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{p.vblood}</span>
                  <span className="pstats__label">V Blood kills</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{p.pvp}</span>
                  <span className="pstats__label">PvP kills</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{p.points.toLocaleString()}</span>
                  <span className="pstats__label">Points</span>
                </div>
              </div>
            </section>

            {p.latestVBlood && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Latest Kill</h2>
                <p className="pstats__latest">
                  🩸 {p.latestVBlood.name || 'V Blood boss'}
                  {p.latestVBlood.at && (
                    <span className="pstats__latestdate"> · {formatDate(p.latestVBlood.at)}</span>
                  )}
                </p>
              </section>
            )}

            {p.perServer?.length > 0 && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">By server</h2>
                <ServerSplit entries={p.perServer} />
                <div className="rankservers">
                  {p.perServer.map((s) => (
                    <ServerStat key={s.serverId} {...s} />
                  ))}
                </div>
              </section>
            )}

            <Rivalries steamId={p.steamId} />

            <ActivityHeatmap steamId={p.steamId} />
          </article>
        )}
      </main>
    </div>
  )
}
