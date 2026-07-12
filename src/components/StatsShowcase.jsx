import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// The competitive features (leaderboard, PvP, clans, hunt) each live on their own
// page reached through the nav dropdowns — easy to miss. This section is the front
// door: four themed "portal" cards on the home page, each teasing a live #1 so the
// standings feel alive and one tap lands you on the full page.
const PORTALS = [
  {
    key: 'leaderboard',
    to: '/leaderboard',
    theme: 'violet',
    icon: '🏆',
    title: 'Leaderboard',
    sub: 'Points, rank badges & season standings',
  },
  {
    key: 'pvp',
    to: '/pvp',
    theme: 'blood',
    icon: '⚔️',
    title: 'PvP Arena',
    sub: 'Top killers, Elo rating & rampages',
  },
  {
    key: 'clans',
    to: '/clans',
    theme: 'cyan',
    icon: '🛡️',
    title: 'Clans',
    sub: 'Clan wars, rosters & the raid feed',
  },
  {
    key: 'hunt',
    to: '/hunt',
    theme: 'venom',
    icon: '🩸',
    title: 'V Blood Hunt',
    sub: 'Boss-clear race & the Hall of Fame',
  },
]

export default function StatsShowcase() {
  const [hl, setHl] = useState(null)
  const [clan, setClan] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/weekly-highlights')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setHl(d?.highlights || {}))
      .catch(() => live && setHl({}))
    fetch('/api/clans?limit=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setClan(d?.entries?.[0] || null))
      .catch(() => live && setClan(null))
    return () => {
      live = false
    }
  }, [])

  // Resolve each portal's live "who's on top" line from the data we fetched.
  const nameOf = (e) => e?.member?.username || e?.charName
  const liveLine = (key) => {
    if (key === 'leaderboard' && hl?.topPoints)
      return { label: 'Top this week', name: nameOf(hl.topPoints), meta: `${hl.topPoints.value.toLocaleString()} pts` }
    if (key === 'pvp' && hl?.topPvp)
      return { label: 'Deadliest', name: nameOf(hl.topPvp), meta: `${hl.topPvp.value} kills` }
    if (key === 'hunt' && hl?.topVBlood)
      return { label: 'Most V Bloods', name: nameOf(hl.topVBlood), meta: `${hl.topVBlood.value} felled` }
    if (key === 'clans' && clan)
      return { label: 'Top clan', name: clan.clanName, meta: `${clan.points.toLocaleString()} pts` }
    return null
  }

  return (
    <section className="section showcase" id="standings">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Season · Live standings</p>
          <h2 className="section__title">Climb the ranks</h2>
          <p className="section__lead">
            Every session is tracked. Rack up points, top the PvP charts, take your clan to war
            and race to fell every V Blood boss. Pick your battleground.
          </p>
        </div>

        <div className="showcase__grid">
          {PORTALS.map((p) => {
            const line = liveLine(p.key)
            return (
              <a
                key={p.key}
                className={`showcase__portal showcase__portal--${p.theme}`}
                {...linkProps(p.to)}
              >
                <span className="showcase__icon" aria-hidden="true">
                  {p.icon}
                </span>
                <span className="showcase__ptitle">{p.title}</span>
                <span className="showcase__psub">{p.sub}</span>
                <span className="showcase__live">
                  {line ? (
                    <>
                      <span className="showcase__livelabel">{line.label}</span>
                      <span className="showcase__livename" title={line.name}>
                        {line.name}
                      </span>
                      <span className="showcase__livemeta">{line.meta}</span>
                    </>
                  ) : (
                    <span className="showcase__livedim">See the full standings</span>
                  )}
                </span>
                <span className="showcase__go" aria-hidden="true">
                  Open <span className="showcase__arrow">→</span>
                </span>
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}
