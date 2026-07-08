import { useEffect } from 'react'
import AnnouncementBanner from './components/AnnouncementBanner.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Servers from './components/Servers.jsx'
import News from './components/News.jsx'
import Events from './components/Events.jsx'
import Community from './components/Community.jsx'
import Members from './components/Members.jsx'
import Achievements from './components/Achievements.jsx'
import Suggestions from './components/Suggestions.jsx'
import Rules from './components/Rules.jsx'
import Footer from './components/Footer.jsx'
import PublicProfile from './components/PublicProfile.jsx'
import { usePath } from './lib/router.js'
import { useAuth } from './auth/AuthContext.jsx'

function LoginToast() {
  const { notice, clearNotice } = useAuth()
  if (!notice) return null
  return (
    <div className="toast" role="alert">
      <span>{notice}</span>
      <button className="toast__close" onClick={clearNotice} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}

// Fire-and-forget, privacy-friendly page-view beacon (no cookies/PII).
function useAnalytics(path) {
  useEffect(() => {
    fetch('/api/hit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {})
  }, [path])
}

export default function App() {
  const path = usePath()
  useAnalytics(path)

  const profileMatch = path.match(/^\/u\/([^/]+)\/?$/)
  if (profileMatch)
    return (
      <>
        <LoginToast />
        <PublicProfile profileKey={decodeURIComponent(profileMatch[1])} />
      </>
    )

  return (
    <>
      <LoginToast />
      <AnnouncementBanner />
      <Navbar />
      <main>
        <Hero />
        <Servers />
        <News />
        <Events />
        <Members />
        <Achievements />
        <Suggestions />
        <Community />
        <Rules />
      </main>
      <Footer />
    </>
  )
}
