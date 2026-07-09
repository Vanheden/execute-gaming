import { useEffect, useState, useMemo } from 'react'
import { rankForPoints } from '../data/ranks.js'
import { linkProps } from '../lib/router.js'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

function ResultRow({ p }) {
  const href = p.member ? `/u/${p.member.key}` : `/p/${p.steamId}`
  const name = p.member?.username || p.charName
  const { tier } = rankForPoints(p.points)

  return (
    <a className="psearch__row" {...linkProps(href)}>
      <span className="lb__rankpill" style={{ '--rank': tier.color }}>
        <span className="lb__rankicon" aria-hidden="true">{tier.icon}</span>
        {tier.name}
      </span>
      <span className="psearch__name">{name}</span>
      {!p.member && <span className="badge badge--guest">Guest</span>}
      <span className="psearch__stats">
        {formatDuration(p.seconds)} · {p.vblood} V Blood · {p.pvp} PvP · {p.points.toLocaleString()} pts
      </span>
    </a>
  )
}

export default function PlayerSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => {
    if (debounced.length < 2) {
      setResults(null)
      return
    }
    let live = true
    fetch(`/api/players/search?q=${encodeURIComponent(debounced)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setResults(d.players || []))
      .catch(() => live && setResults([]))
    return () => { live = false }
  }, [debounced])

  const hasQuery = query.trim().length >= 2

  return (
    <section className="section section--alt" id="players">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Find any player</p>
          <h2 className="section__title">Player Search</h2>
          <p className="section__lead">
            Search all tracked players — registered members and guests alike. Find someone's stats, rank and profile.
          </p>
        </div>

        <input
          className="psearch__input"
          type="text"
          placeholder="Type a player name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        {!hasQuery && (
          <p className="empty">Start typing a name to search (min. 2 characters).</p>
        )}

        {hasQuery && results === null && (
          <p className="empty">Searching…</p>
        )}

        {hasQuery && results !== null && results.length === 0 && (
          <p className="empty">No players found matching "{query}".</p>
        )}

        {results && results.length > 0 && (
          <div className="psearch__results">
            {results.map((p) => (
              <ResultRow key={p.steamId} p={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
