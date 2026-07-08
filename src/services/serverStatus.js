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
    return fetchViaBattleMetrics(server)
  }
  // No battlemetricsId (e.g. CS 1.6) → fall back to mock for now.
  return fetchMock(server)
}

// ---------------------------------------------------------------------------
// BattleMetrics — used for the V Rising servers.
// Public endpoint, no auth: https://www.battlemetrics.com/developers/documentation
// ---------------------------------------------------------------------------
async function fetchViaBattleMetrics(server) {
  const url = `https://api.battlemetrics.com/servers/${server.battlemetricsId}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) {
      return { state: 'offline', players: 0, maxPlayers: server.maxPlayers }
    }
    const { data } = await res.json()
    const a = data?.attributes ?? {}
    return {
      state: a.status === 'online' ? 'online' : 'offline',
      players: a.players ?? 0,
      maxPlayers: a.maxPlayers ?? server.maxPlayers,
      map: a.details?.map || undefined,
    }
  } catch {
    // Network/CORS error — show "unknown" rather than a fake number.
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
