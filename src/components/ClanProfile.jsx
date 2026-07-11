import { useEffect, useState } from 'react'
import { community, servers } from '../data/servers.js'
import { linkProps } from '../lib/router.js'

// Clan profile page (/c/:clanGuid). Totals, member roster and the clan's
// clan-vs-clan war record. Data: GET /api/clan/:clanGuid.

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h === 0 ? `${m}m` : `${h}h ${m}m`
}

const SERVER_BY_ID = Object.fromEntries(servers.map((s) => [s.id, s]))

// A member name linking to their profile (registered → /u/:key, guest → /p/:steamId).
function MemberLink({ m }) {
  const href = m.member ? `/u/${m.member.key}` : `/p/${m.steamId}`
  return (
    <a className="clanroster__name" {...linkProps(href)} title={m.charName}>
      {m.charName}
    </a>
  )
}

export default function ClanProfile({ clanGuid }) {
  const [state, setState] = useState({ status: 'loading', clan: null })

  useEffect(() => {
    let live = true
    setState({ status: 'loading', clan: null })
    fetch(`/api/clan/${encodeURIComponent(clanGuid)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setState({ status: 'ok', clan: d }))
      .catch(() => live && setState({ status: 'notfound', clan: null }))
    return () => {
      live = false
    }
  }, [clanGuid])

  const c = state.clan

  useEffect(() => {
    document.title = c ? `${c.clanName || 'Clan'} · ${community.name}` : community.name
    return () => {
      document.title = community.name
    }
  }, [c])

  const srv = c && SERVER_BY_ID[c.serverId]

  return (
    <div className="pubprofile">
      <header className="nav nav--scrolled">
        <div className="nav__inner container">
          <a className="nav__brand" {...linkProps('/')}>
            <img className="nav__logo" src="/logo.svg" alt="" aria-hidden="true" />
            <span>{community.name}</span>
          </a>
          <a className="btn btn--ghost btn--sm" {...linkProps('/clans')}>
            ← Back to clans
          </a>
        </div>
      </header>

      <main className="container pubprofile__main">
        {state.status === 'loading' && <p className="empty">Loading clan…</p>}

        {state.status === 'notfound' && (
          <div className="pubprofile__missing">
            <h1 className="section__title">Clan not found</h1>
            <p className="section__lead">This clan has no tracked activity on our servers.</p>
            <a className="btn" {...linkProps('/clans')}>
              Back to the clan leaderboard
            </a>
          </div>
        )}

        {state.status === 'ok' && c && (
          <article className="pubcard">
            <div className="pubcard__head">
              <span className="clan__crest clan__crest--lg" aria-hidden="true">
                {c.clanName?.[0]?.toUpperCase() || '⚔'}
              </span>
              <div>
                <h1 className="pubcard__name">{c.clanName || 'Unnamed clan'}</h1>
                <div className="pubcard__sub">
                  <span className="pubcard__rank">
                    {c.members} member{c.members === 1 ? '' : 's'}
                  </span>
                  {srv && (
                    <span className="lb__server" style={{ '--srv': srv.accent }} title={srv.name}>
                      <span className="lb__serverdot" aria-hidden="true" />
                      {srv.name.replace(/^.*—\s*/, '')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <section className="pubcard__section">
              <h2 className="pubcard__label">Stats</h2>
              <div className="pstats">
                <div className="pstats__item">
                  <span className="pstats__num">{formatDuration(c.seconds)}</span>
                  <span className="pstats__label">Playtime</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{c.vblood}</span>
                  <span className="pstats__label">V Blood kills</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{c.distinctBosses}</span>
                  <span className="pstats__label">Bosses felled</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{c.pvp}</span>
                  <span className="pstats__label">PvP kills</span>
                </div>
                <div className="pstats__item">
                  <span className="pstats__num">{c.points.toLocaleString()}</span>
                  <span className="pstats__label">Points</span>
                </div>
              </div>
            </section>

            {c.wars?.length > 0 && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Clan wars</h2>
                <ul className="clanwars">
                  {c.wars.map((w) => {
                    const won = w.kills > w.deaths
                    const even = w.kills === w.deaths
                    return (
                      <li className="clanwars__row" key={w.clanGuid}>
                        <a className="clanwars__rival" {...linkProps(`/c/${w.clanGuid}`)}>
                          {w.clanName}
                        </a>
                        <span
                          className={`clanwars__score ${
                            even ? '' : won ? 'clanwars__score--win' : 'clanwars__score--loss'
                          }`}
                        >
                          <span className="clanwars__k">{w.kills}</span>
                          <span className="clanwars__sep">–</span>
                          <span className="clanwars__d">{w.deaths}</span>
                        </span>
                        <span className="clanwars__verdict">
                          {even ? 'Even' : won ? 'Winning' : 'Losing'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}

            {c.raidRecord && (c.raidRecord.raidsDone > 0 || c.raidRecord.raidsSuffered > 0) && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Castle raids</h2>
                <div className="raidrec">
                  <div className="raidrec__tile raidrec__tile--done">
                    <span className="raidrec__num">{c.raidRecord.raidsDone}</span>
                    <span className="raidrec__label">Raids landed ⚔️</span>
                  </div>
                  <div className="raidrec__tile raidrec__tile--suffered">
                    <span className="raidrec__num">{c.raidRecord.raidsSuffered}</span>
                    <span className="raidrec__label">Raids suffered 🛡️</span>
                  </div>
                </div>
                {c.raidRecord.rivals?.length > 0 && (
                  <ul className="clanwars clanwars--raids">
                    {c.raidRecord.rivals.map((r) => {
                      const won = r.raided > r.raidedBy
                      const even = r.raided === r.raidedBy
                      return (
                        <li className="clanwars__row" key={r.clanGuid}>
                          <a className="clanwars__rival" {...linkProps(`/c/${r.clanGuid}`)}>
                            {r.clanName}
                          </a>
                          <span
                            className={`clanwars__score ${
                              even ? '' : won ? 'clanwars__score--win' : 'clanwars__score--loss'
                            }`}
                          >
                            <span className="clanwars__k">{r.raided}</span>
                            <span className="clanwars__sep">–</span>
                            <span className="clanwars__d">{r.raidedBy}</span>
                          </span>
                          <span className="clanwars__verdict">raided / raided by</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )}

            {c.roster?.length > 0 && (
              <section className="pubcard__section">
                <h2 className="pubcard__label">Roster</h2>
                <ul className="clanroster">
                  {c.roster.map((m) => (
                    <li className="clanroster__row" key={m.steamId}>
                      <span className="clanroster__crest" aria-hidden="true">
                        {(m.charName || '?')[0]?.toUpperCase()}
                      </span>
                      <div className="clanroster__info">
                        <MemberLink m={m} />
                        <span className="clanroster__meta">
                          {formatDuration(m.seconds)} · {m.vblood} V Blood · {m.pvp} PvP
                        </span>
                      </div>
                      {m.member && <span className="badge badge--guest">Member</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
