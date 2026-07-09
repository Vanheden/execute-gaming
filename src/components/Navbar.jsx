import { useEffect, useState } from 'react'
import { community } from '../data/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePath, linkProps } from '../lib/router.js'
import LoginModal from './LoginModal.jsx'
import ProfileModal from './ProfileModal.jsx'

const LINKS = [
  { label: 'Servers', to: '/#servers' },
  { label: 'News', to: '/#news' },
  { label: 'Events', to: '/events', page: true },
  { label: 'Members', to: '/members', page: true },
  { label: 'Leaderboard', to: '/leaderboard', page: true },
  { label: 'Achievements', to: '/achievements', page: true },
  { label: 'Suggestions', to: '/suggestions', page: true },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const { user, loading } = useAuth()
  const path = usePath()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sub-pages get a solid bar (no dark hero behind the nav to sit over).
  const solid = scrolled || path !== '/'

  return (
    <>
      <header className={`nav ${solid ? 'nav--scrolled' : ''}`}>
        <div className="nav__inner container">
          <a className="nav__brand" {...linkProps('/')} onClick={(e) => { linkProps('/').onClick(e); setOpen(false) }}>
            <img className="nav__logo" src="/logo.svg" alt="" aria-hidden="true" />
            <span>{community.name}</span>
          </a>

          <nav className={`nav__links ${open ? 'nav__links--open' : ''}`}>
            {LINKS.map((link) => {
              const active = link.page && path === link.to
              const lp = linkProps(link.to)
              return (
                <a
                  key={link.to}
                  {...lp}
                  className={active ? 'nav__link--on' : undefined}
                  aria-current={active ? 'page' : undefined}
                  onClick={(e) => {
                    lp.onClick(e)
                    setOpen(false)
                  }}
                >
                  {link.label}
                </a>
              )
            })}
            <a className="btn btn--ghost btn--sm" href={community.discord} target="_blank" rel="noreferrer">
              Discord
            </a>

            {!loading &&
              (user ? (
                <button
                  className="nav__user"
                  onClick={() => {
                    setProfileOpen(true)
                    setOpen(false)
                  }}
                  title="View profile"
                >
                  {user.avatar ? (
                    <img className="nav__avatar" src={user.avatar} alt="" />
                  ) : (
                    <span className="nav__avatar nav__avatar--ph">
                      {user.username?.[0]?.toUpperCase() || '?'}
                    </span>
                  )}
                  <span className="nav__uname">{user.username}</span>
                  {user.role === 'admin' && <span className="badge badge--admin">Admin</span>}
                </button>
              ) : (
                <button
                  className="btn btn--sm"
                  onClick={() => {
                    setLoginOpen(true)
                    setOpen(false)
                  }}
                >
                  Log in
                </button>
              ))}
          </nav>

          <button
            className="nav__burger"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  )
}
