// ---------------------------------------------------------------------------
// Tiny path router — no dependency, just the History API
// ---------------------------------------------------------------------------
// Real routes: the home page (with #hash sections), the standalone feature
// pages (/events, /members, /achievements, /suggestions) and the shareable
// public profile pages (/u/:key). Kept dependency-free on purpose.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react'

function scrollToHash(hash, smooth) {
  const el = hash && document.getElementById(hash.slice(1))
  if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' })
  else window.scrollTo(0, 0)
}

// Navigate to a path, optionally with a #hash (to jump to a home section).
export function navigate(to) {
  const url = new URL(to, window.location.origin)
  const samePath = url.pathname === window.location.pathname
  window.history.pushState({}, '', url.pathname + url.hash)
  window.dispatchEvent(new PopStateEvent('popstate'))
  if (url.hash) {
    // Wait for the target route to render, then jump to the section.
    if (samePath) scrollToHash(url.hash, true)
    else requestAnimationFrame(() => setTimeout(() => scrollToHash(url.hash, false), 60))
  } else {
    window.scrollTo(0, 0)
  }
}

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  return path
}

// Props for an internal link that stays crawlable + middle-clickable but does a
// client-side navigation on a normal left-click.
export function linkProps(to) {
  return {
    href: to,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(to)
    },
  }
}
