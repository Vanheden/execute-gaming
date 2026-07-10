import { useInView } from '../hooks/useInView.js'

// Wraps a section and fades/rises it into view on scroll. Purely presentational;
// under prefers-reduced-motion the CSS makes this a no-op (content shown at once).
export default function Reveal({ children, className = '' }) {
  const [ref, inView] = useInView()
  return (
    <div ref={ref} className={`reveal ${inView ? 'reveal--in' : ''} ${className}`}>
      {children}
    </div>
  )
}
