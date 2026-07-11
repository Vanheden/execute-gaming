import { useEffect } from 'react'
import AnnouncementBanner from './components/AnnouncementBanner.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Servers from './components/Servers.jsx'
import News from './components/News.jsx'
import Events from './components/Events.jsx'
import Community from './components/Community.jsx'
import Members from './components/Members.jsx'
import Leaderboard from './components/Leaderboard.jsx'
import Pvp from './components/Pvp.jsx'
import ClanLeaderboard from './components/ClanLeaderboard.jsx'
import ClanProfile from './components/ClanProfile.jsx'
import Achievements from './components/Achievements.jsx'
import Suggestions from './components/Suggestions.jsx'
import VBloodHunt from './components/VBloodHunt.jsx'
import PlayerSearch from './components/PlayerSearch.jsx'
import Rules from './components/Rules.jsx'
import RulesPage from './components/RulesPage.jsx'
import Footer from './components/Footer.jsx'
import PublicProfile from './components/PublicProfile.jsx'
import PlayerProfile from './components/PlayerProfile.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import Reveal from './components/Reveal.jsx'
import { usePath } from './lib/router.js'
import { useAuth } from './auth/AuthContext.jsx'

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

// Shared chrome for every routed page. `standalone` pages (not the home page)
// get top padding so the first section clears the fixed navbar.
function Layout({ children, standalone }) {
  return (
    <>
      <LoginToast />
      <AnnouncementBanner />
      <Navbar />
      <main className={standalone ? 'main--page' : undefined}>{children}</main>
      <Footer />
    </>
  )
}

// Standalone feature pages: path → the section component to show.
const PAGES = {
  '/events': Events,
  '/members': Members,
  '/leaderboard': Leaderboard,
  '/pvp': Pvp,
  '/clans': ClanLeaderboard,
  '/achievements': Achievements,
  '/suggestions': Suggestions,
  '/rules': RulesPage,
  '/hunt': VBloodHunt,
  '/players': PlayerSearch,
  '/admin': AdminPanel,
}

export default function App() {
  const path = usePath()
  useAnalytics(path)

  // Deep-link / reload onto a home #section (e.g. /#news).
  useEffect(() => {
    if (path === '/' && window.location.hash) {
      const id = window.location.hash.slice(1)
      setTimeout(() => document.getElementById(id)?.scrollIntoView(), 80)
    }
  }, [path])

  const profileMatch = path.match(/^\/u\/([^/]+)\/?$/)
  if (profileMatch)
    return (
      <>
        <LoginToast />
        <PublicProfile profileKey={decodeURIComponent(profileMatch[1])} />
      </>
    )

  const playerMatch = path.match(/^\/p\/(\d+)\/?$/)
  if (playerMatch)
    return (
      <>
        <LoginToast />
        <PlayerProfile steamId={playerMatch[1]} />
      </>
    )

  const clanMatch = path.match(/^\/c\/([^/]+)\/?$/)
  if (clanMatch)
    return (
      <>
        <LoginToast />
        <ClanProfile clanGuid={decodeURIComponent(clanMatch[1])} />
      </>
    )

  const Page = PAGES[path.replace(/\/$/, '')]
  if (Page)
    return (
      <Layout standalone>
        <Page />
      </Layout>
    )

  return (
    <Layout>
      <Hero />
      <Reveal>
        <Servers />
      </Reveal>
      <Reveal>
        <News />
      </Reveal>
      <Reveal>
        <Community />
      </Reveal>
      <Reveal>
        <Rules />
      </Reveal>
    </Layout>
  )
}
