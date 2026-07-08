import { createContext, useContext, useEffect, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [providers, setProviders] = useState({ discord: false, steam: false })

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
    // Clean the ?login=success|failed param the backend adds after a redirect.
    const params = new URLSearchParams(window.location.search)
    if (params.has('login')) {
      window.history.replaceState({}, '', window.location.pathname)
    }

    Promise.all([
      refresh(),
      fetch('/api/config')
        .then((r) => (r.ok ? r.json() : { providers: {} }))
        .then((d) => setProviders(d.providers || {}))
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
    <AuthContext.Provider value={{ user, loading, providers, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
