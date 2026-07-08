import AnnouncementBanner from './components/AnnouncementBanner.jsx'
import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Servers from './components/Servers.jsx'
import News from './components/News.jsx'
import Events from './components/Events.jsx'
import Community from './components/Community.jsx'
import Members from './components/Members.jsx'
import Suggestions from './components/Suggestions.jsx'
import Rules from './components/Rules.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  return (
    <>
      <AnnouncementBanner />
      <Navbar />
      <main>
        <Hero />
        <Servers />
        <News />
        <Events />
        <Members />
        <Suggestions />
        <Community />
        <Rules />
      </main>
      <Footer />
    </>
  )
}
