import { useCallback, useEffect, useState } from 'react'

// Returns [ref, inView]. `inView` flips true once the element scrolls into the
// viewport, then the observer disconnects (one-shot — for reveals & count-ups).
//
// `ref` is a CALLBACK ref on purpose: the target may mount later than the hook
// (e.g. a panel that shows a skeleton first, then swaps in the real element). A
// plain useRef would be observed only on the initial mount and miss that swap,
// leaving `inView` stuck false. Tracking the node in state re-runs the observer
// whenever the element actually attaches. Falls back to true when
// IntersectionObserver is unavailable, so content is never left hidden.
export function useInView({ threshold = 0.15, rootMargin = '0px 0px -8% 0px' } = {}) {
  const [node, setNode] = useState(null)
  const ref = useCallback((el) => setNode(el), [])
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          obs.disconnect()
        }
      },
      { threshold, rootMargin },
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [node, threshold, rootMargin])

  return [ref, inView]
}

// True when the user asked for reduced motion — used to skip animations.
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}
