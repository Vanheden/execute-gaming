import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'
import { useInView, prefersReducedMotion } from '../hooks/useInView.js'

// Community-wide totals + the hottest PvP feud + top play streaks. Rendered at the
// top of the leaderboard page. Everything is aggregate/public — no PII.

const TILES = [
  { key: 'seconds', icon: '⏳', label: 'Hours played', value: (s) => Math.round(s.seconds / 3600) },
  { key: 'vblood', icon: '🩸', label: 'V Bloods felled', value: (s) => s.vblood },
  { key: 'pvp', icon: '⚔️', label: 'PvP kills', value: (s) => s.pvp },
  { key: 'players', icon: '🧛', label: 'Vampires tracked', value: (s) => s.players },
]

// Counts up from 0 to `end` (easeOutCubic) the first time it scrolls into view.
// Honours reduced-motion by jumping straight to the value.
function CountUp({ end, run }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!run) return
    if (prefersReducedMotion() || end <= 0) {
      setN(end)
      return
    }
    let raf
    const start = performance.now()
    const dur = 1100
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur)
      setN(Math.round(end * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [end, run])
  return n.toLocaleString()
}

// Placeholder strip shown while the stats are loading, so the panel doesn't pop in.
function MilestonesSkeleton() {
  return (
    <div className="milestones milestones--skel" aria-hidden="true">
      <h3 className="milestones__title">🏰 Community milestones</h3>
      <div className="milestones__grid">
        {TILES.map((t) => (
          <div className="milestones__tile" key={t.key}>
            <span className="milestones__icon">{t.icon}</span>
            <span className="sk milestones__num" />
            <span className="sk milestones__label" />
          </div>
        ))}
      </div>
    </div>
  )
}

// A player name that links to their profile (member → /u/:key, guest → /p/:steamId).
function PlayerLink({ p, className }) {
  const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
  return (
    <a className={className} {...linkProps(href)} title={p.charName}>
      {p.charName}
    </a>
  )
}

export default function Milestones() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ref, inView] = useInView()

  useEffect(() => {
    fetch('/api/global-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <MilestonesSkeleton />
  if (!data?.stats) return null
  const { stats, hottestFeud, topStreaks } = data
  // Nothing tracked yet → don't render an empty strip.
  if (!stats.sessions && !stats.vblood && !stats.pvp) return null

  return (
    <div className="milestones" ref={ref}>
      <h3 className="milestones__title">🏰 Community milestones</h3>
      <div className="milestones__grid">
        {TILES.map((t) => (
          <div className="milestones__tile" key={t.key}>
            <span className="milestones__icon">{t.icon}</span>
            <span className="milestones__num">
              <CountUp end={t.value(stats)} run={inView} />
            </span>
            <span className="milestones__label">{t.label}</span>
          </div>
        ))}
      </div>

      <div className="milestones__extra">
        {hottestFeud && (
          <div className="milestones__feud">
            <span className="milestones__feudicon">🔥</span>
            <span className="milestones__feudlabel">Hottest feud</span>
            <span className="milestones__feudline">
              <PlayerLink p={hottestFeud.killer} className="milestones__feudname" />
              {' has slain '}
              <PlayerLink p={hottestFeud.victim} className="milestones__feudname" />
              {' '}
              <strong>{hottestFeud.kills}×</strong>
            </span>
          </div>
        )}

        {topStreaks?.length > 0 && (
          <div className="milestones__streaks">
            <span className="milestones__streakhead">🔥 Longest active streaks</span>
            <ol className="milestones__streaklist">
              {topStreaks.map((s) => (
                <li className="milestones__streakrow" key={s.steamId}>
                  <PlayerLink p={s} className="milestones__streakname" />
                  <span className="milestones__streakdays">
                    {s.current > 0 ? `${s.current}🔥` : `best ${s.longest}`}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
