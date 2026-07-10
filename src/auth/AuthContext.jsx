import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState({ discord: false, steam: false })
  const [turnstile, setTurnstile] = useState({ enabled: false, siteKey: null })
  const [notice, setNotice] = useState(null)

  async function refresh() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' })
      const data = res.ok ? await res.json() : { user: null }
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }

  useEffect(() => {
    // Clean the ?login / ?linked / ?linkerror params the backend adds after a
    // redirect, surfacing a message for the failure (and link) cases.
    const params = new URLSearchParams(window.location.search)
    let dirty = false
    if (params.has('login')) {
      const status = params.get('login')
      if (status === 'banned') setNotice("You're banned from this community.")
      else if (status === 'failed') setNotice('Login failed — please try again.')
      else if (status === 'required') setNotice('Please sign in first.')
      else if (status === 'captcha') setNotice('Captcha check failed — please try again.')
      dirty = true
    }
    if (params.has('linked')) {
      const p = params.get('linked')
      setNotice(`Linked your ${p === 'steam' ? 'Steam' : p === 'discord' ? 'Discord' : p} account.`)
      dirty = true
    }
    if (params.has('linkerror')) {
      setNotice(`Couldn't link account: ${params.get('linkerror') || 'please try again.'}`)
      dirty = true
    }
    if (dirty) window.history.replaceState({}, '', window.location.pathname)

    Promise.all([
      refresh(),
      fetch('/api/config')
        .then((r) => (r.ok ? r.json() : { providers: {} }))
        .then((d) => {
          setProviders(d.providers || {})
          setTurnstile(d.turnstile || { enabled: false, siteKey: null })
        })
        .catch(() => {}),
    ]).finally(() => setLoading(false))
  }, [])

  async function logout() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' })
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, providers, turnstile, logout, refresh, notice, clearNotice: () => setNotice(null) }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
