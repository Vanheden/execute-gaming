import { useEffect, useState } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = 372 // ~53 weeks, enough to fill a year with partial week at edges

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function ActivityHeatmap({ steamId }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let live = true
    fetch(`/api/player/${encodeURIComponent(steamId)}/activity?days=${DAYS}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d.activity || []))
      .catch(() => live && setData([]))
    return () => {
      live = false
    }
  }, [steamId])

  if (!data) return null

  // Build a map of date → seconds
  const map = new Map(data.map((d) => [d.date, d.seconds]))
  const maxSeconds = Math.max(1, ...data.map((d) => d.seconds))

  // Generate the last N days, oldest first
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(d)
  }

  // Group into weeks (columns), each starting on Sunday
  const weeks = []
  let week = []
  for (const d of dates) {
    if (d.getDay() === 0 && week.length > 0) {
      weeks.push(week)
      week = []
    }
    const iso = d.toISOString().slice(0, 10)
    week.push({ date: d, iso, seconds: map.get(iso) || 0 })
  }
  if (week.length > 0) weeks.push(week)

  // Month labels: show a label when the first day of a month appears
  const monthLabels = []
  let lastMonth = -1
  weeks.forEach((w, i) => {
    const firstDay = w[0].date
    if (firstDay.getMonth() !== lastMonth) {
      monthLabels.push({ col: i, label: MONTHS[firstDay.getMonth()] })
      lastMonth = firstDay.getMonth()
    }
  })

  function level(seconds) {
    if (seconds === 0) return 0
    const ratio = seconds / maxSeconds
    if (ratio < 0.25) return 1
    if (ratio < 0.5) return 2
    if (ratio < 0.75) return 3
    return 4
  }

  const totalSeconds = data.reduce((s, d) => s + d.seconds, 0)
  const activeDays = data.filter((d) => d.seconds > 0).length

  return (
    <section className="pubcard__section">
      <h2 className="pubcard__label">Activity</h2>
      <p className="heatmap__summary">
        {activeDays} active days · {formatDuration(totalSeconds)} in the last year
      </p>
      <div className="heatmap">
        <div className="heatmap__months">
          {monthLabels.map((m, i) => (
            <span
              key={i}
              className="heatmap__month"
              style={{ gridColumn: `${m.col + 1} / span 1` }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="heatmap__grid">
          {weeks.map((w, wi) => (
            <div className="heatmap__col" key={wi}>
              {w.map((d) => (
                <div
                  key={d.iso}
                  className={`heatmap__cell heatmap__cell--${level(d.seconds)}`}
                  title={`${d.iso}: ${d.seconds > 0 ? formatDuration(d.seconds) : 'no activity'}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <div key={l} className={`heatmap__cell heatmap__cell--${l} heatmap__cell--sm`} />
        ))}
        <span>More</span>
      </div>
    </section>
  )
}
