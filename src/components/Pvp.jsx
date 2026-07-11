import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'
import KillFeed from './KillFeed.jsx'
import PvpLadder from './PvpLadder.jsx'

// -------------------------------------------------------------------------
// Pvp — the PvP hub (/pvp). Gathers everything combat-related in one place:
// the Elo rating ladder, the raw kill-count board, a live PvP-only feed and
// the fiercest ongoing rivalry.
// -------------------------------------------------------------------------

const MEDALS = ['🥇', '🥈', '🥉']

// Raw PvP-kill count board (ranked by kills, not rating).
function TopKillers() {
  const [entries, setEntries] = useState(null)

  useEffect(() => {
    fetch('/api/leaderboard?metric=pvp&period=all&limit=8')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEntries((d.entries || []).filter((e) => e.pvp > 0)))
      .catch(() => setEntries([]))
  }, [])

  if (!entries || entries.length === 0) return null
  const max = entries[0].pvp

  return (
    <div className="pvphub__card">
      <h3 className="pvphub__cardtitle">💀 Top PvP killers</h3>
      <ol className="topkills">
        {entries.map((e, i) => {
          const href = e.member ? `/u/${e.member.key}` : `/p/${e.steamId}`
          return (
            <li className="topkills__row" key={e.steamId}>
              <span className="topkills__rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
              <a className="topkills__name" {...linkProps(href)} title={e.charName}>
                {e.charName}
              </a>
              <span className="topkills__track" aria-hidden="true">
                <span className="topkills__bar" style={{ width: `${max ? (e.pvp / max) * 100 : 0}%` }} />
              </span>
              <span className="topkills__num">{e.pvp}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// The single most one-sided rivalry, as a callout.
function FiercestFeud() {
  const [feud, setFeud] = useState(null)

  useEffect(() => {
    fetch('/api/global-stats')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setFeud(d.hottestFeud || null))
      .catch(() => setFeud(null))
  }, [])

  if (!feud) return null
  const kh = feud.killer.member ? `/u/${feud.killer.member.key}` : `/p/${feud.killer.steamId}`
  const vh = feud.victim.member
    ? `/u/${feud.victim.member.key}`
    : feud.victim.steamId
      ? `/p/${feud.victim.steamId}`
      : null

  return (
    <div className="pvphub__card pvphub__card--feud">
      <h3 className="pvphub__cardtitle">🔥 Fiercest rivalry</h3>
      <p className="feud__line">
        <a className="feud__killer" {...linkProps(kh)}>
          {feud.killer.charName || 'Unknown vampire'}
        </a>{' '}
        has slain{' '}
        {vh ? (
          <a className="feud__victim" {...linkProps(vh)}>
            {feud.victim.charName}
          </a>
        ) : (
          <span className="feud__victim">{feud.victim.charName}</span>
        )}{' '}
        <strong className="feud__count">{feud.kills}×</strong>
      </p>
    </div>
  )
}

export default function Pvp() {
  return (
    <section className="section section--alt" id="pvp">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Blood for blood</p>
          <h2 className="section__title">PvP Arena</h2>
          <p className="section__lead">
            Skill ratings, kill counts and the fiercest rivalries across our V Rising servers.
          </p>
        </div>

        <div className="lb-layout">
          <aside className="lb-sidebar">
            <KillFeed kind="pvp" />
          </aside>
          <div className="lb-main">
            <FiercestFeud />
            <PvpLadder />
            <TopKillers />
          </div>
        </div>
      </div>
    </section>
  )
}
