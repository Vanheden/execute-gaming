import { useEffect, useRef } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

// Cloudflare Turnstile widget. Loads the CF script once (shared across mounts) and
// renders explicitly so we control the token lifecycle. Renders nothing when
// Turnstile isn't configured (dev), so callers can drop it in unconditionally.
//
// Props:
//   onVerify(token|null) — called with the token on success, or null when it
//                          expires / errors (so callers can re-disable submit).
//   resetSignal          — bump this number to force a fresh challenge after the
//                          previous token was consumed server-side.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let scriptPromise = null

function loadScript() {
  if (typeof window !== 'undefined' && window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('turnstile script failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export default function Turnstile({ onVerify, resetSignal = 0 }) {
  const { turnstile } = useAuth()
  const ref = useRef(null)
  const widgetId = useRef(null)
  // Keep the latest callback without re-rendering the widget on every parent render.
  const cb = useRef(onVerify)
  cb.current = onVerify

  const enabled = turnstile?.enabled && turnstile?.siteKey

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: turnstile.siteKey,
          theme: 'dark',
          callback: (token) => cb.current?.(token),
          'expired-callback': () => cb.current?.(null),
          'error-callback': () => cb.current?.(null),
        })
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current)
        } catch {
          /* widget already gone */
        }
        widgetId.current = null
      }
    }
  }, [enabled, turnstile?.siteKey])

  // Force a fresh token when the parent bumps resetSignal (e.g. after a successful
  // submit consumed the previous one). Skips the initial mount (resetSignal === 0).
  useEffect(() => {
    if (!resetSignal || !widgetId.current || !window.turnstile) return
    try {
      window.turnstile.reset(widgetId.current)
    } catch {
      /* noop */
    }
    cb.current?.(null)
  }, [resetSignal])

  if (!enabled) return null
  return <div className="turnstile" ref={ref} />
}
