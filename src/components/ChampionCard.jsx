import { useEffect, useState } from 'react'
import { rankForPoints } from '../data/ranks.js'
import { linkProps } from '../lib/router.js'
import { useInView, prefersReducedMotion } from '../hooks/useInView.js'

// Spotlight hero at the very top of the leaderboard: the reigning all-time Points
// champion. Self-contained — it fetches the points/all-time ladder itself so it
// stays fixed on the true #1 regardless of the metric/period/server tabs below.
// Reuses the existing /api/leaderboard endpoint (no new endpoint).

// Bat silhouette placeholder for a champion without a linked avatar.
function Bat() {
  return (
    <svg className="champ__bat" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 8.2c0 0-.8-2.2-2.2-2.2 0 0 .5.9.4 1.6 0 0-1.6-2.2-4.6-1.2 0 0 1 .5 1.2 1.2
           0 0-2.8-.4-4.4 2.2 0 0 1.9-.4 2.8.1 0 0-1.8 1.1-1.6 3.5 0 0 2-2.2 4.4-1.2 2 .8 3 2.2 4 4
           1-1.8 2-3.2 4-4 2.4-1 4.4 1.2 4.4 1.2.2-2.4-1.6-3.5-1.6-3.5.9-.5 2.8-.1 2.8-.1
           -1.6-2.6-4.4-2.2-4.4-2.2.2-.7 1.2-1.2 1.2-1.2-3-1-4.6 1.2-4.6 1.2-.1-.7.4-1.6.4-1.6C12.8 6 12 8.2 12 8.2Z"
      />
    </svg>
  )
}

// Human-readable playtime as {value, unit} parts so the unit can be dimmed.
function playtimeParts(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return { value: `${m}`, unit: 'm' }
  return { value: `${h}`, unit: `h ${m}m` }
}

// Counts up 0 → end (easeOutCubic) once scrolled into view. Honours reduced-motion.
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

function ChampionSkeleton() {
  return (
    <div className="champ champ--skel" aria-hidden="true">
      <div className="champ__glow" />
      <div className="champ__avatarwrap">
        <span className="sk champ__avatar" />
      </div>
      <div className="champ__body">
        <span className="sk sk--line" style={{ width: '120px', height: '13px' }} />
        <span className="sk sk--line" style={{ width: '220px', height: '26px', marginTop: '8px' }} />
        <div className="champ__stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="champ__stat" key={i}>
              <span className="sk sk--line" style={{ width: '52px', height: '22px' }} />
              <span className="sk sk--line sk--sm" style={{ width: '40px', marginTop: '6px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function ChampionCard() {
  const [entry, setEntry] = useState(undefined) // undefined = loading, null = none
  const [ref, inView] = useInView()

  useEffect(() => {
    fetch('/api/leaderboard?metric=points&period=all')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntry(d.entries?.[0] || null))
      .catch(() => setEntry(null))
  }, [])

  if (entry === undefined) return <ChampionSkeleton />
  if (!entry) return null

  const e = entry
  const href = e.member ? `/u/${e.member.key}` : `/p/${e.steamId}`
  const points = e.allTimePoints ?? e.points ?? 0
  const { tier } = rankForPoints(points)
  const pt = playtimeParts(e.seconds)

  const STATS = [
    { key: 'points', label: 'Points', node: <CountUp end={e.points} run={inView} />, cls: 'champ__stat--pts' },
    {
      key: 'playtime',
      label: 'Played',
      node: (
        <>
          {pt.value}
          <span className="champ__unit">{pt.unit}</span>
        </>
      ),
    },
    { key: 'vblood', label: e.vblood === 1 ? 'V Blood' : 'V Bloods', node: e.vblood, cls: 'champ__stat--vb' },
    { key: 'pvp', label: e.pvp === 1 ? 'PvP kill' : 'PvP kills', node: e.pvp, cls: 'champ__stat--pvp' },
  ]

  return (
    <div className={`champ champ--in ${inView ? 'champ--seen' : ''}`} ref={ref} style={{ '--rank': tier.color }}>
      <div className="champ__glow" aria-hidden="true" />
      <span className="champ__crown" aria-hidden="true">
        👑
      </span>

      <a className="champ__avatarwrap" {...linkProps(href)} aria-label={e.name}>
        {e.member?.avatar ? (
          <img className="champ__avatar" src={e.member.avatar} alt="" loading="lazy" />
        ) : (
          <span className="champ__avatar champ__avatar--ph">
            <Bat />
          </span>
        )}
        <span className="champ__ring" aria-hidden="true" />
      </a>

      <div className="champ__body">
        <p className="champ__eyebrow">Reigning Champion</p>
        <div className="champ__nameline">
          <a className="champ__name" {...linkProps(href)}>
            {e.name}
          </a>
          <span className="champ__rank" title={`${tier.name} · ${points.toLocaleString()} pts`}>
            <span className="champ__rankicon" aria-hidden="true">
              {tier.icon}
            </span>
            {tier.name}
          </span>
        </div>

        <div className="champ__stats">
          {STATS.map((s) => (
            <div className={`champ__stat ${s.cls || ''}`} key={s.key}>
              <span className="champ__statnum">{s.node}</span>
              <span className="champ__statlabel">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
