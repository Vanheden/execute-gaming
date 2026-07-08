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
