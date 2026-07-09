import { useEffect, useState } from 'react'
import { linkProps } from '../lib/router.js'

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

const CATEGORIES = [
  { key: 'topPlaytime', icon: '⏰', label: 'Most Playtime', fmt: (v) => formatDuration(v) },
  { key: 'topVBlood', icon: '🩸', label: 'Most V Blood Kills', fmt: (v) => `${v} kills` },
  { key: 'topPvp', icon: '⚔️', label: 'Most PvP Kills', fmt: (v) => `${v} kills` },
  { key: 'topPoints', icon: '⭐', label: 'Most Points', fmt: (v) => `${v.toLocaleString()} pts` },
]

export default function WeeklyHighlights() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/api/weekly-highlights')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setData(d.highlights || {}))
      .catch(() => setData({}))
  }, [])

  if (!data) return null

  const hasAny = CATEGORIES.some((c) => data[c.key])
  if (!hasAny) return null

  return (
    <div className="weeklyhl">
      <h3 className="weeklyhl__title">📅 This Week's Highlights</h3>
      <div className="weeklyhl__grid">
        {CATEGORIES.map((cat) => {
          const entry = data[cat.key]
          if (!entry) return null
          const href = entry.member ? `/u/${entry.member.key}` : `/p/${entry.steamId}`
          const name = entry.member?.username || entry.charName
          return (
            <div className="weeklyhl__card" key={cat.key}>
              <span className="weeklyhl__icon">{cat.icon}</span>
              <span className="weeklyhl__label">{cat.label}</span>
              <a className="weeklyhl__name" {...linkProps(href)}>
                {name}
              </a>
              <span className="weeklyhl__value">{cat.fmt(entry.value)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
