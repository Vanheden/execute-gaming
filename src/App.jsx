import Navbar from './components/Navbar.jsx'
import Hero from './components/Hero.jsx'
import Servers from './components/Servers.jsx'
import Community from './components/Community.jsx'
import Members from './components/Members.jsx'
import Rules from './components/Rules.jsx'
import Footer from './components/Footer.jsx'

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Servers />
        <Community />
        <Members />
        <Rules />
      </main>
      <Footer />
    </>
  )
}
