import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api.js'

// A full-width, auto-scrolling band of the latest kills / boss falls, right under
// the hero. It makes the site feel alive 24/7 — something is always happening.
// Reuses the same /api/kills/recent feed as the leaderboard's kill feed and honours
// the same admin on/off flag.
export default function Ticker() {
  const [items, setItems] = useState(null)
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    let live = true
    apiGet('/api/killfeed/enabled')
      .then((d) => live && setEnabled(d.enabled))
      .catch(() => live && setEnabled(false))

    const poll = () => {
      fetch('/api/kills/recent?limit=20')
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => live && setItems(d.kills || []))
        .catch(() => live && setItems([]))
    }
    poll()
    const id = setInterval(poll, 30000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [])

  // Need a few events for a scroll to read as motion rather than a twitch.
  if (!enabled || !items || items.length < 3) return null

  // Duplicate the sequence so the CSS marquee loops seamlessly (track shifts -50%).
  const seq = [...items, ...items]

  return (
    <div className="ticker" role="region" aria-label="Live activity feed">
      <span className="ticker__badge">
        <span className="ticker__dot" aria-hidden="true" />
        Live
      </span>
      <div className="ticker__viewport">
        <div className="ticker__track">
          {seq.map((k, i) => {
            const vb = k.kind === 'vblood'
            return (
              <span className="ticker__item" key={i} aria-hidden={i >= items.length ? 'true' : undefined}>
                <span className="ticker__icon">{vb ? '🩸' : '⚔️'}</span>
                <b className="ticker__who">{k.charName}</b>
                <span className="ticker__verb">{vb ? 'felled' : 'killed'}</span>
                <span className={`ticker__victim ${vb ? 'is-vb' : 'is-pvp'}`}>
                  {k.victim || (vb ? 'a V Blood' : 'a rival')}
                </span>
                <span className="ticker__sep" aria-hidden="true">
                  •
                </span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
