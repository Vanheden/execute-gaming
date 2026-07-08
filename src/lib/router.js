// ---------------------------------------------------------------------------
// Tiny path router — no dependency, just the History API
// ---------------------------------------------------------------------------
// The site is a single page; the only real "routes" are the shareable public
// profile pages (/u/:key). This keeps that working without pulling in a router.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react'

export function navigate(path) {
  if (path === window.location.pathname) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
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
export function linkProps(path) {
  return {
    href: path,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      navigate(path)
    },
  }
}
