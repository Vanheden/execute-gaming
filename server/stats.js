// ---------------------------------------------------------------------------
// Player-count history + live status — via a direct Steam A2S query.
// ---------------------------------------------------------------------------
// Queries each game server's own query port (server.query) for live status +
// player count. First-party and free — no BattleMetrics / third party. Runs
// server-side on a timer so the history graph builds over time.
// ---------------------------------------------------------------------------
import { db } from './db.js'
import { servers } from '../src/data/servers.js'
import { queryA2S } from './a2s.js'

const POLL_MINUTES = Number(process.env.STATS_POLL_MINUTES) || 5
const RETENTION_DAYS = 30

const insertStmt = db.prepare(
  'INSERT INTO server_stats (serverId, players, maxPlayers, at) VALUES (?, ?, ?, ?)',
)

async function fetchOne(server) {
  const r = await queryA2S(server.query.host, server.query.port)
  if (!r.online) throw new Error('offline/unreachable')
  return { players: r.players, maxPlayers: r.maxPlayers || server.maxPlayers }
}

let running = false
export async function pollAll() {
  if (running) return
  running = true
  const at = new Date().toISOString()
  try {
    for (const server of servers) {
      if (!server.query) continue
      try {
        const { players, maxPlayers } = await fetchOne(server)
        insertStmt.run(server.id, players, maxPlayers, at)
      } catch {
        // Skip this server this round (offline / unreachable).
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

// --- Live status ------------------------------------------------------------
// One server's current status via A2S, cached briefly so a burst of page loads
// doesn't flood the query port.
const statusCache = new Map() // serverId -> { at, data }
const STATUS_TTL = 20 * 1000

export async function getLiveStatus(serverId) {
  const server = servers.find((s) => s.id === serverId)
  if (!server) return null
  if (!server.query) return { state: 'unknown', players: 0, maxPlayers: server.maxPlayers }

  const cached = statusCache.get(serverId)
  if (cached && Date.now() - cached.at < STATUS_TTL) return cached.data

  const r = await queryA2S(server.query.host, server.query.port)
  const out = r.online
    ? { state: 'online', players: r.players, maxPlayers: r.maxPlayers || server.maxPlayers, map: r.map }
    : { state: 'offline', players: 0, maxPlayers: server.maxPlayers }
  statusCache.set(serverId, { at: Date.now(), data: out })
  return out
}

export function startPolling() {
  pollAll() // once at startup
  const timer = setInterval(pollAll, POLL_MINUTES * 60 * 1000)
  timer.unref?.() // don't keep the process alive just for polling
  return timer
}
