// ---------------------------------------------------------------------------
// Lightweight, privacy-friendly analytics — self-hosted, no third parties
// ---------------------------------------------------------------------------
// A per-day, per-path hit counter. No cookies, no IPs, no fingerprints, no
// cross-site anything — just aggregate counts stored in our own SQLite file.
// ---------------------------------------------------------------------------
import { db } from './db.js'

const today = () => new Date().toISOString().slice(0, 10) // YYYY-MM-DD

// Normalise a client-supplied path to something safe and low-cardinality.
function cleanPath(raw) {
  if (typeof raw !== 'string') return null
  let p = raw.split('?')[0].split('#')[0].trim()
  if (!p.startsWith('/')) p = '/' + p
  if (p.length > 1) p = p.replace(/\/+$/, '') || '/'
  if (p.length > 120) return null
  // Collapse the public-profile key so we don't store one row per member.
  p = p.replace(/^\/u\/[^/]+$/, '/u/:key')
  return p
}

export function recordHit(rawPath) {
  const path = cleanPath(rawPath)
  if (!path) return false
  db.prepare(
    `INSERT INTO page_views (day, path, count) VALUES (?, ?, 1)
     ON CONFLICT(day, path) DO UPDATE SET count = count + 1`,
  ).run(today(), path)
  return true
}

// Summary for the last `days` days: per-day totals + top paths (all-time-window).
export function summary(days = 30) {
  const n = Math.min(Math.max(Number(days) || 30, 1), 365)
  const since = new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

  const perDay = db
    .prepare(
      `SELECT day, SUM(count) AS views FROM page_views WHERE day >= ? GROUP BY day ORDER BY day ASC`,
    )
    .all(since)
    .map((r) => ({ day: r.day, views: Number(r.views) }))

  const topPaths = db
    .prepare(
      `SELECT path, SUM(count) AS views FROM page_views WHERE day >= ?
       GROUP BY path ORDER BY views DESC LIMIT 15`,
    )
    .all(since)
    .map((r) => ({ path: r.path, views: Number(r.views) }))

  const total = perDay.reduce((s, d) => s + d.views, 0)
  return { days: n, total, perDay, topPaths }
}
