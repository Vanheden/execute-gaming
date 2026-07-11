import { useEffect, useRef, useState } from 'react'
import { community } from '../data/servers.js'
import { rankForPoints } from '../data/ranks.js'

// -------------------------------------------------------------------------
// SeasonRecap — a shareable "V Rising Wrapped" card for one player.
//
// The card is a single self-contained <svg> (no external images or web fonts)
// so it rasterises cleanly to a PNG the player can drop straight into Discord.
// All styling lives in an embedded <style> block so the serialised standalone
// SVG keeps its look when exported.
// -------------------------------------------------------------------------

const VB_W = 640
const VB_H = 860

function slug(name) {
  return (name || 'vampire').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'vampire'
}

// 2×3 headline stat grid geometry.
const GRID = { x: 50, y: 372, tw: 260, th: 92, gx: 20, gy: 16 }
function tilePos(i) {
  const col = i % 2
  const row = Math.floor(i / 2)
  return { x: GRID.x + col * (GRID.tw + GRID.gx), y: GRID.y + row * (GRID.th + GRID.gy) }
}

function RecapCard({ recap, svgRef }) {
  const { tier } = rankForPoints(recap.points)
  const season = recap.seasonStart
    ? `${new Date(recap.seasonStart).getFullYear()} SEASON`
    : 'ALL-TIME RECAP'

  const stats = [
    { num: `${recap.hours}h`, label: 'PLAYTIME' },
    { num: recap.pvp, label: 'PVP KILLS' },
    { num: recap.vblood, label: 'V BLOOD KILLS' },
    { num: recap.raids, label: 'RAIDS LANDED' },
    { num: recap.points.toLocaleString(), label: 'POINTS' },
    { num: recap.rank ? `#${recap.rank}` : '—', label: recap.percentile ? `TOP ${recap.percentile}%` : 'RANK' },
  ]

  return (
    <svg
      ref={svgRef}
      className="recap__svg"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`Season recap for ${recap.charName || 'this vampire'}`}
    >
      <defs>
        <linearGradient id="recapBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a0d12" />
          <stop offset="0.5" stopColor="#120a10" />
          <stop offset="1" stopColor="#0b0710" />
        </linearGradient>
        <radialGradient id="recapGlow" cx="0.5" cy="0.28" r="0.7">
          <stop offset="0" stopColor="#ff2d55" stopOpacity="0.20" />
          <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
        <style>{`
          .r-wm { fill:#8a94a6; font:700 15px 'Segoe UI',system-ui,sans-serif; letter-spacing:3px }
          .r-season { fill:#ff6b81; font:700 15px 'Segoe UI',system-ui,sans-serif; letter-spacing:3px }
          .r-icon { font-size:70px }
          .r-title { fill:#ffffff; font:800 36px 'Segoe UI',system-ui,sans-serif }
          .r-blurb { fill:#a7748a; font:italic 500 16px 'Segoe UI',system-ui,sans-serif }
          .r-name { fill:#e8ebf2; font:600 22px 'Segoe UI',system-ui,sans-serif }
          .r-pill { fill:#ffffff; font:700 17px 'Segoe UI',system-ui,sans-serif }
          .r-num { fill:#ffffff; font:800 32px 'Segoe UI',system-ui,sans-serif }
          .r-lbl { fill:#9aa3b2; font:700 12px 'Segoe UI',system-ui,sans-serif; letter-spacing:1.5px }
          .r-nem { fill:#c7ccd8; font:500 16px 'Segoe UI',system-ui,sans-serif }
          .r-nemb { fill:#ff6b81; font:700 16px 'Segoe UI',system-ui,sans-serif }
          .r-foot { fill:#6b7280; font:700 13px 'Segoe UI',system-ui,sans-serif; letter-spacing:2px }
        `}</style>
      </defs>

      {/* background */}
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="28" fill="url(#recapBg)" />
      <rect x="0" y="0" width={VB_W} height={VB_H} rx="28" fill="url(#recapGlow)" />
      <rect x="1.5" y="1.5" width={VB_W - 3} height={VB_H - 3} rx="27" fill="none" stroke="#ff2d55" strokeOpacity="0.25" strokeWidth="1.5" />

      {/* header */}
      <text className="r-wm" x="40" y="56">{community.name.toUpperCase()}</text>
      <text className="r-season" x={VB_W - 40} y="56" textAnchor="end">{season}</text>
      <line x1="40" y1="76" x2={VB_W - 40} y2="76" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />

      {/* archetype hero */}
      <text className="r-icon" x={VB_W / 2} y="176" textAnchor="middle">{recap.archetype.icon}</text>
      <text className="r-title" x={VB_W / 2} y="222" textAnchor="middle">{recap.archetype.title}</text>
      <text className="r-blurb" x={VB_W / 2} y="250" textAnchor="middle">{recap.archetype.blurb}</text>

      {/* name + rank pill */}
      <text className="r-name" x={VB_W / 2} y="292" textAnchor="middle">{recap.charName || 'Unknown vampire'}</text>
      <rect x={VB_W / 2 - 150} y="308" width="300" height="40" rx="20" fill={tier.color} fillOpacity="0.14" stroke={tier.color} strokeOpacity="0.5" strokeWidth="1" />
      <text className="r-pill" x={VB_W / 2} y="334" textAnchor="middle" fill={tier.color}>
        {tier.icon}  {tier.name.toUpperCase()}
      </text>

      {/* stat grid */}
      {stats.map((s, i) => {
        const p = tilePos(i)
        return (
          <g key={s.label}>
            <rect x={p.x} y={p.y} width={GRID.tw} height={GRID.th} rx="14" fill="#ffffff" fillOpacity="0.035" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1" />
            <text className="r-num" x={p.x + GRID.tw / 2} y={p.y + 44} textAnchor="middle">{s.num}</text>
            <text className="r-lbl" x={p.x + GRID.tw / 2} y={p.y + 70} textAnchor="middle">{s.label}</text>
          </g>
        )
      })}

      {/* nemesis strip */}
      {recap.nemesis ? (
        <text x={VB_W / 2} y="756" textAnchor="middle">
          <tspan className="r-nem">😈 Nemesis: </tspan>
          <tspan className="r-nemb">{recap.nemesis.name}</tspan>
          <tspan className="r-nem"> — killed you {recap.nemesis.kills}× (you got {recap.nemesis.revenge} back)</tspan>
        </text>
      ) : (
        <text x={VB_W / 2} y="756" textAnchor="middle" className="r-nem">No nemesis yet — the night has been kind.</text>
      )}
      <line x1="40" y1="792" x2={VB_W - 40} y2="792" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="1" />

      {/* footer */}
      <text className="r-foot" x="40" y="826">🩸 EXECUTE-GAMING · V RISING</text>
      <text className="r-foot" x={VB_W - 40} y="826" textAnchor="end">{community.discord.replace('https://', '')}</text>
    </svg>
  )
}

export default function SeasonRecap({ steamId, embedded = true }) {
  const [recap, setRecap] = useState(undefined) // undefined = loading, null = none
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const svgRef = useRef(null)

  useEffect(() => {
    let live = true
    setRecap(undefined)
    fetch(`/api/player/${encodeURIComponent(steamId)}/recap`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setRecap(d.recap))
      .catch(() => live && setRecap(null))
    return () => {
      live = false
    }
  }, [steamId])

  async function downloadPng() {
    const svg = svgRef.current
    if (!svg || busy) return
    setBusy(true)
    try {
      const scale = 2
      const xml = new XMLSerializer().serializeToString(svg)
      const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = src
      })
      const canvas = document.createElement('canvas')
      canvas.width = VB_W * scale
      canvas.height = VB_H * scale
      const ctx = canvas.getContext('2d')
      ctx.scale(scale, scale)
      ctx.drawImage(img, 0, 0)
      await new Promise((resolve) =>
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${slug(recap?.charName)}-recap.png`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
          }
          resolve()
        }, 'image/png'),
      )
    } catch {
      /* rasterisation failed — the card is still visible on the page */
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/p/${steamId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  // Nothing to show for players with no tracked activity.
  if (recap === null) return null
  if (recap === undefined) {
    return embedded ? (
      <section className="pubcard__section">
        <h2 className="pubcard__label">Season recap</h2>
        <p className="recap__loading">Building the card…</p>
      </section>
    ) : null
  }

  const body = (
    <div className="recap">
      <div className="recap__stage">
        <RecapCard recap={recap} svgRef={svgRef} />
      </div>
      <div className="recap__actions">
        <button className="btn btn--sm" onClick={downloadPng} disabled={busy}>
          {busy ? 'Rendering…' : '⬇ Download card'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={copyLink}>
          {copied ? '✓ Link copied' : '🔗 Copy link'}
        </button>
        <span className="recap__hint">Drop it in Discord to flex your season.</span>
      </div>
    </div>
  )

  if (!embedded) return body

  return (
    <section className="pubcard__section">
      <h2 className="pubcard__label">Season recap</h2>
      {body}
    </section>
  )
}
