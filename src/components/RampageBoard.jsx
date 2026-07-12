import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// -------------------------------------------------------------------------
// RampageBoard — the biggest PvP killstreaks this season. A streak is a run
// of PvP kills with no death in between; `peak` is the best a player reached,
// `current` their live streak. Players still on a hot streak get a flame.
// Hidden until at least one real streak (peak ≥ 2) exists.
// -------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉']

// Same tier ladder the mod announces in-game (see RAMPAGE_TIERS in playtime.js).
function tierOf(peak) {
  if (peak >= 10) return { name: 'Godlike', emoji: '👑', color: '#ffcf40' }
  if (peak >= 7) return { name: 'Unstoppable', emoji: '⚡', color: '#a366e6' }
  if (peak >= 5) return { name: 'Dominating', emoji: '💀', color: '#ff5470' }
  if (peak >= 3) return { name: 'Rampage', emoji: '🔥', color: '#ff8a3d' }
  return { name: 'Streak', emoji: '', color: '#9aa3b2' }
}

export default function RampageBoard() {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    fetch('/api/pvp/rampages?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setRows(d.rampages || []))
      .catch(() => setRows([]))
  }, [])

  if (!rows || rows.length === 0) return null

  const top = rows[0].peak

  return (
    <div className="pvpladder rampage">
      <div className="pvpladder__head">
        <h3 className="pvpladder__title">🔥 Biggest Rampages</h3>
        <span className="pvpladder__sub">Longest PvP killstreaks without dying — this season.</span>
      </div>
      <ol className="pvpladder__list">
        {rows.map((r, i) => {
          const tier = tierOf(r.peak)
          const pct = top ? Math.round((r.peak / top) * 100) : 0
          const href = r.member ? `/u/${r.member.key}` : `/p/${r.steamId}`
          const hot = r.current >= 3
          return (
            <li className={`pvpladder__row ${i < 3 ? 'pvpladder__row--top' : ''}`} key={r.steamId}>
              <span className="pvpladder__rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <a className="pvpladder__name" {...linkProps(href)} title={r.name}>
                {r.name}
                {hot && <span className="rampage__live" title={`On a ${r.current}-kill streak now`}> 🔥{r.current}</span>}
              </a>
              <span className="rampage__tier" style={{ '--tier': tier.color }}>
                {tier.emoji} {tier.name}
              </span>
              <span className="pvpladder__rating" style={{ '--tier': tier.color }}>
                <span className="pvpladder__bar" style={{ '--pct': `${pct}%` }} aria-hidden="true" />
                <span className="pvpladder__num">{r.peak}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
