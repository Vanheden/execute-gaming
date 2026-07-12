import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// -------------------------------------------------------------------------
// PvpLadder — the PvP skill-rating (Elo) board. Every PvP kill is a 1v1 match
// that shifts both fighters' ratings; this shows the established top duellists.
// Hidden until at least two rated fighters exist.
// -------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉']

// Rating tiers just add a splash of colour + a label to the number.
function tierOf(rating) {
  if (rating >= 1300) return { name: 'Warlord', color: '#ffcf40' }
  if (rating >= 1150) return { name: 'Duelist', color: '#a366e6' }
  if (rating >= 1000) return { name: 'Fighter', color: '#33c9c9' }
  return { name: 'Fledgling', color: '#9aa3b2' }
}

export default function PvpLadder() {
  const [players, setPlayers] = useState(null)

  useEffect(() => {
    fetch('/api/pvp/leaderboard?limit=10')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPlayers(d.players || []))
      .catch(() => setPlayers([]))
  }, [])

  if (!players || players.length < 2) return null

  const top = players[0].rating

  return (
    <div className="pvpladder">
      <div className="pvpladder__head">
        <h3 className="pvpladder__title">⚔️ PvP Rating</h3>
        <span className="pvpladder__sub">Skill rating from every duel — win to climb, die to fall.</span>
      </div>
      <ol className="pvpladder__list">
        {players.map((p, i) => {
          const tier = tierOf(p.rating)
          const pct = top ? Math.round((p.rating / top) * 100) : 0
          return (
            <li className={`pvpladder__row ${i < 3 ? 'pvpladder__row--top' : ''}`} key={p.steamId}>
              <span className="pvpladder__rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <a className="pvpladder__name" {...linkProps(`/p/${p.steamId}`)} title={p.charName || 'Unknown'}>
                {p.charName || 'Unknown vampire'}
              </a>
              <span className="pvpladder__wl">
                {p.wins}<span className="pvpladder__wlsep">–</span>{p.losses}
              </span>
              <span className="pvpladder__rating" style={{ '--tier': tier.color }}>
                <span className="pvpladder__bar" style={{ '--pct': `${pct}%` }} aria-hidden="true" />
                <span className="pvpladder__num">{p.rating}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
