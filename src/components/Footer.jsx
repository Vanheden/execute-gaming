import { community } from '../data/servers.js'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <img className="nav__logo" src="/logo.svg" alt="" aria-hidden="true" />
          <span>{community.name}</span>
        </div>
        <nav className="footer__links">
          <a href="#servers">Servers</a>
          <a href="#community">Community</a>
          <a href="#rules">Rules</a>
          <a href={community.discord} target="_blank" rel="noreferrer">
            Discord
          </a>
        </nav>
        <p className="footer__copy">
          © {new Date().getFullYear()} {community.name}. Not affiliated with Stunlock Studios.
        </p>
      </div>
    </footer>
  )
}
