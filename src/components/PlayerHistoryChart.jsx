import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api.js'

// viewBox geometry (scales to container width via CSS)
const W = 600
const H = 170
const PADL = 8
const PADR = 10
const PADT = 14
const PADB = 24
const plotW = W - PADL - PADR
const plotH = H - PADT - PADB
const baseline = PADT + plotH

function fmtTime(iso, spanHours) {
  const d = new Date(iso)
  return spanHours > 48
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export default function PlayerHistoryChart({ server }) {
  const [hours, setHours] = useState(24)
  const [points, setPoints] = useState(null)
  const [hover, setHover] = useState(null) // index into points
  const svgRef = useRef(null)

  useEffect(() => {
    let active = true
    setPoints(null)
    apiGet(`/api/servers/${server.id}/history?hours=${hours}`)
      .then((d) => active && setPoints(d.points))
      .catch(() => active && setPoints([]))
    return () => {
      active = false
    }
  }, [server.id, hours])

  const ranges = [
    [24, '24h'],
    [168, '7d'],
  ]

  const header = (
    <div className="phc__head">
      <h4 className="phc__title">Players — last {hours === 24 ? '24 hours' : '7 days'}</h4>
      <div className="phc__ranges">
        {ranges.map(([h, label]) => (
          <button
            key={h}
            className={`phc__range ${hours === h ? 'phc__range--on' : ''}`}
            onClick={() => setHover(null) || setHours(h)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )

  if (!points) {
    return (
      <div className="phc" style={{ '--accent': server.accent }}>
        {header}
        <p className="phc__empty">Loading…</p>
      </div>
    )
  }

  if (points.length < 2) {
    return (
      <div className="phc" style={{ '--accent': server.accent }}>
        {header}
        <p className="phc__empty">
          Collecting player data — the graph fills in as we track the server.
        </p>
      </div>
    )
  }

  // Scales
  const t0 = Date.now() - hours * 3600e3
  const t1 = Date.now()
  const values = points.map((p) => p.players)
  const peak = Math.max(...values)
  const yMax = Math.max(5, Math.min(server.maxPlayers, Math.ceil(peak * 1.2)))
  const x = (iso) => PADL + Math.max(0, Math.min(1, (new Date(iso).getTime() - t0) / (t1 - t0))) * plotW
  const y = (v) => PADT + (1 - v / yMax) * plotH

  const pts = points.map((p) => ({ ...p, px: x(p.at), py: y(p.players) }))
  const linePath = pts.map((p, i) => `${i ? 'L' : 'M'}${p.px.toFixed(1)} ${p.py.toFixed(1)}`).join(' ')
  const areaPath = `M${pts[0].px.toFixed(1)} ${baseline} ${linePath.replace('M', 'L')} L${pts[pts.length - 1].px.toFixed(1)} ${baseline} Z`

  const last = pts[pts.length - 1]
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length)
  const gid = `phc-grad-${server.id}`

  const yTicks = [0, Math.round(yMax / 2), yMax]

  function onMove(e) {
    const rect = svgRef.current.getBoundingClientRect()
    const vx = ((e.clientX - rect.left) / rect.width) * W
    let nearest = 0
    let best = Infinity
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].px - vx)
      if (d < best) {
        best = d
        nearest = i
      }
    }
    setHover(nearest)
  }

  const hp = hover != null ? pts[hover] : null

  return (
    <div className="phc" style={{ '--accent': server.accent }}>
      {header}

      <div className="phc__stats">
        <div><span className="phc__stat">{last.players}</span><span className="phc__lbl">now</span></div>
        <div><span className="phc__stat">{peak}</span><span className="phc__lbl">peak</span></div>
        <div><span className="phc__stat">{avg}</span><span className="phc__lbl">avg</span></div>
      </div>

      <div className="phc__wrap">
        <svg
          ref={svgRef}
          className="phc__svg"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Player count over the last ${hours} hours, peak ${peak}`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines + y labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={PADL} x2={W - PADR} y1={y(v)} y2={y(v)} className="phc__grid" />
              <text x={PADL} y={y(v) - 3} className="phc__ylabel">{v}</text>
            </g>
          ))}

          <path d={areaPath} fill={`url(#${gid})`} />
          <path d={linePath} className="phc__line" />

          {/* latest-point marker */}
          <circle cx={last.px} cy={last.py} r="4" className="phc__dot" />

          {/* hover crosshair */}
          {hp && (
            <>
              <line x1={hp.px} x2={hp.px} y1={PADT} y2={baseline} className="phc__cross" />
              <circle cx={hp.px} cy={hp.py} r="4.5" className="phc__hoverdot" />
            </>
          )}

          {/* x labels */}
          <text x={PADL} y={H - 6} className="phc__xlabel" textAnchor="start">
            {fmtTime(points[0].at, hours)}
          </text>
          <text x={W - PADR} y={H - 6} className="phc__xlabel" textAnchor="end">now</text>
        </svg>

        {hp && (
          <div
            className="phc__tip"
            style={{ left: `${(hp.px / W) * 100}%` }}
          >
            <strong>{hp.players} players</strong>
            <span>{fmtTime(hp.at, hours)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
