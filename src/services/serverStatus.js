// ---------------------------------------------------------------------------
// Server status service
// ---------------------------------------------------------------------------
// This decides, per server, how to fetch live status:
//
//   • V Rising servers  → BattleMetrics public API (no API key needed).
//                          Just fill in each server's `battlemetricsId`
//                          in src/data/servers.js.
//
//   • CS 1.6 server     → still MOCK data, because a browser can't send the
//                          UDP Source query a 1.6 server needs. To make it
//                          live you'd run a tiny backend (e.g. the `gamedig`
//                          npm package) and fetch its JSON in `fetchViaBackend`
//                          below. Ask and I'll build that for you.
//
// Every component only depends on the shape returned here, so the UI never
// changes regardless of the source.
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ServerStatus
 * @property {'online'|'offline'|'unknown'|'loading'} state
 * @property {number} players      Current player count
 * @property {number} maxPlayers   Slot count
 * @property {string} [map]        Current map, if known
 */

/**
 * Fetch live status for one server. Picks the right source automatically.
 * @param {object} server
 * @returns {Promise<ServerStatus>}
 */
export async function fetchServerStatus(server) {
  if (server.battlemetricsId) {
    return fetchViaProxy(server)
  }
  // No battlemetricsId (e.g. CS 1.6) → fall back to mock for now.
  return fetchMock(server)
}

// ---------------------------------------------------------------------------
// Same-origin proxy — used for the V Rising servers.
// The backend fetches BattleMetrics server-side (see server/stats.js) and caches
// it. Going through our own API means a visitor's VPN/adblock/firewall blocking
// api.battlemetrics.com can no longer blank the card, and CORS stops mattering.
// ---------------------------------------------------------------------------
async function fetchViaProxy(server) {
  try {
    const res = await fetch(`/api/servers/${encodeURIComponent(server.id)}/status`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return { state: 'offline', players: 0, maxPlayers: server.maxPlayers }
    }
    const { status } = await res.json()
    return status || { state: 'unknown', players: 0, maxPlayers: server.maxPlayers }
  } catch {
    return { state: 'unknown', players: 0, maxPlayers: server.maxPlayers }
  }
}

// ---------------------------------------------------------------------------
// Backend query — placeholder for CS 1.6 (needs your own small server).
// Point this at your endpoint returning { players, maxPlayers, map } and call
// it from fetchServerStatus when `server.query` is set.
// ---------------------------------------------------------------------------
// async function fetchViaBackend(server) {
//   const res = await fetch(`https://your-backend.example.com/status/${server.id}`)
//   if (!res.ok) return { state: 'offline', players: 0, maxPlayers: server.maxPlayers }
//   const s = await res.json()
//   return { state: 'online', players: s.players, maxPlayers: s.maxPlayers, map: s.map }
// }

// ---------------------------------------------------------------------------
// Mock fallback — stable pseudo-random numbers so the UI looks alive.
// ---------------------------------------------------------------------------
const MOCK_MAPS = {}

function fetchMock(server) {
  let h = 0
  for (const c of server.id) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  const minute = Math.floor(Date.now() / 60000)
  const players = (h + minute) % (Math.min(server.maxPlayers, 24) + 1)
  return Promise.resolve({
    state: 'online',
    players,
    maxPlayers: server.maxPlayers,
    map: MOCK_MAPS[server.id],
  })
}
