import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

// Recent castle raids — the standout of the clan feature. "Clan A raided Clan B · 2h
// ago", shown on the /clans page. Data: GET /api/raids (follows the server filter).
// Renders nothing until there's at least one raid, so it never shows an empty box.

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// One side of a raid: a clan (linked to /c/:guid) where known, else a player (linked
// to their profile), else an anonymous fallback. Returns a linked name + crest.
function Party({ side, fallback }) {
  const name = side.clanName || side.name || fallback
  const href = side.clanGuid
    ? `/c/${side.clanGuid}`
    : side.member
      ? `/u/${side.member.key}`
      : side.steamId
        ? `/p/${side.steamId}`
        : null
  const inner = (
    <>
      <span className="raidfeed__crest" aria-hidden="true">
        {(name || '?')[0]?.toUpperCase()}
      </span>
      <span className="raidfeed__name">{name}</span>
    </>
  )
  return href ? (
    <a className="raidfeed__party raidfeed__party--link" {...linkProps(href)} title={name}>
      {inner}
    </a>
  ) : (
    <span className="raidfeed__party" title={name}>
      {inner}
    </span>
  )
}

export default function RaidFeed({ serverId }) {
  const [raids, setRaids] = useState(null)

  useEffect(() => {
    let live = true
    setRaids(null)
    const params = new URLSearchParams({ limit: '12' })
    if (serverId) params.set('serverId', serverId)
    fetch(`/api/raids?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setRaids(d.raids || []))
      .catch(() => live && setRaids([]))
    return () => {
      live = false
    }
  }, [serverId])

  // Nothing to show yet → render nothing (raids are rare; no empty box).
  if (!raids?.length) return null

  return (
    <div className="raidfeed">
      <h3 className="raidfeed__title">
        <span className="raidfeed__icon" aria-hidden="true">🏰</span>
        Recent Raids
      </h3>
      <ul className="raidfeed__list">
        {raids.map((r) => (
          <li className="raidfeed__row" key={r.eventId}>
            <Party side={r.attacker} fallback="A lone raider" />
            <span className="raidfeed__verb" aria-hidden="true">⚔️ raided</span>
            <Party side={r.defender} fallback="an abandoned hold" />
            <span className="raidfeed__time">{timeAgo(r.occurredAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
