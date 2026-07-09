import { useEffect, useState } from 'react'
import { fetchServerStatus } from '../services/serverStatus.js'

// Polls live status for a server and re-fetches every `intervalMs`.
export function useServerStatus(server, intervalMs = 60000) {
  const [status, setStatus] = useState({ state: 'loading', players: 0, maxPlayers: server.maxPlayers })

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const s = await fetchServerStatus(server)
        if (active) setStatus(s)
      } catch {
        if (active) setStatus({ state: 'offline', players: 0, maxPlayers: server.maxPlayers })
      }
    }

    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [server, intervalMs])

  return status
}

// Polls live status for many servers in one effect, returning a map keyed by
// server id. Used so the page can fetch each server's status once and share it
// between the top status strip and the individual cards (no double-fetching).
export function useServerStatuses(serverList, intervalMs = 60000) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(
      serverList.map((s) => [s.id, { state: 'loading', players: 0, maxPlayers: s.maxPlayers }]),
    ),
  )

  useEffect(() => {
    let active = true

    async function load() {
      const results = await Promise.all(
        serverList.map(async (s) => {
          try {
            return [s.id, await fetchServerStatus(s)]
          } catch {
            return [s.id, { state: 'offline', players: 0, maxPlayers: s.maxPlayers }]
          }
        }),
      )
      if (active) setStatuses(Object.fromEntries(results))
    }

    load()
    const timer = setInterval(load, intervalMs)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [serverList, intervalMs])

  return statuses
}

// Derived display state shared by the card pill and the status strip: a server is
// "full" when it's online and at/over capacity. Returns 'full' | the raw state.
export function displayState(status) {
  if (
    status?.state === 'online' &&
    status.maxPlayers > 0 &&
    status.players >= status.maxPlayers
  )
    return 'full'
  return status?.state || 'unknown'
}
