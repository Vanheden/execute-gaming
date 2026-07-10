// ---------------------------------------------------------------------------
// Player-count history — polls BattleMetrics on a timer and stores snapshots.
// ---------------------------------------------------------------------------
// Runs server-side (independent of visitors) so the graph builds real history
// over time. Reads the same server list the frontend uses.
// ---------------------------------------------------------------------------
import { db } from './db.js'
import { servers } from '../src/data/servers.js'

const UA =
  'Mozilla/5.0 (compatible; Execute-Gaming/1.0; +https://execute-gaming.se)'
const POLL_MINUTES = Number(process.env.STATS_POLL_MINUTES) || 5
const RETENTION_DAYS = 30

const insertStmt = db.prepare(
  'INSERT INTO server_stats (serverId, players, maxPlayers, at) VALUES (?, ?, ?, ?)',
)

async function fetchOne(server) {
  const res = await fetch(`https://api.battlemetrics.com/servers/${server.battlemetricsId}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`status ${res.status}`)
  const { data } = await res.json()
  const a = data?.attributes ?? {}
  return { players: a.players ?? 0, maxPlayers: a.maxPlayers ?? server.maxPlayers }
}

let running = false
export async function pollAll() {
  if (running) return
  running = true
  const at = new Date().toISOString()
  try {
    for (const server of servers) {
      if (!server.battlemetricsId) continue
      try {
        const { players, maxPlayers } = await fetchOne(server)
        insertStmt.run(server.id, players, maxPlayers, at)
      } catch {
        // Skip this server this round (offline / rate-limited / network).
      }
    }
    // Prune old rows so the table stays small.
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString()
    db.prepare('DELETE FROM server_stats WHERE at < ?').run(cutoff)
  } finally {
    running = false
  }
}

// Snapshots for one server within the last `hours` (default 24), oldest first.
export function getHistory(serverId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600e3).toISOString()
  return db
    .prepare(
      'SELECT players, maxPlayers, at FROM server_stats WHERE serverId = ? AND at >= ? ORDER BY at ASC',
    )
    .all(serverId, since)
}

// --- Live status proxy ------------------------------------------------------
// Fetches one server's current status BattleMetrics server-side, so the browser
// never has to reach api.battlemetrics.com directly (a visitor's VPN/adblock/CORS
// used to make the card show "Unknown"). Cached briefly to stay under rate limits.
const statusCache = new Map() // serverId -> { at, data }
const STATUS_TTL = 30 * 1000

export async function getLiveStatus(serverId) {
  const server = servers.find((s) => s.id === serverId)
  if (!server) return null
  if (!server.battlemetricsId) return { state: 'unknown', players: 0, maxPlayers: server.maxPlayers }

  const cached = statusCache.get(serverId)
  if (cached && Date.now() - cached.at < STATUS_TTL) return cached.data

  try {
    const res = await fetch(`https://api.battlemetrics.com/servers/${server.battlemetricsId}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`status ${res.status}`)
    const { data } = await res.json()
    const a = data?.attributes ?? {}
    const out = {
      state: a.status === 'online' ? 'online' : 'offline',
      players: a.players ?? 0,
      maxPlayers: a.maxPlayers ?? server.maxPlayers,
      map: a.details?.map || undefined,
    }
    statusCache.set(serverId, { at: Date.now(), data: out })
    return out
  } catch {
    // Network error or non-OK (rate-limited / down): serve stale if we have it.
    if (cached) return cached.data
    return { state: 'unknown', players: 0, maxPlayers: server.maxPlayers }
  }
}

export function startPolling() {
  pollAll() // once at startup
  const timer = setInterval(pollAll, POLL_MINUTES * 60 * 1000)
  timer.unref?.() // don't keep the process alive just for polling
  return timer
}
