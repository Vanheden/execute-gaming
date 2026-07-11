import { useEffect, useState, useRef } from 'react'
import { community } from '../data/servers.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { usePath, linkProps } from '../lib/router.js'
import LoginModal from './LoginModal.jsx'
import ProfileModal from './ProfileModal.jsx'

const NAV_GROUPS = [
  {
    label: 'Community',
    items: [
      { label: 'Servers', to: '/#servers' },
      { label: 'News', to: '/#news' },
      { label: 'Events', to: '/events', page: true },
      { label: 'Members', to: '/members', page: true },
      { label: 'Suggestions', to: '/suggestions', page: true },
    ],
  },
  {
    label: 'Stats',
    items: [
      { label: 'Leaderboard', to: '/leaderboard', page: true },
      { label: 'PvP', to: '/pvp', page: true },
      { label: 'Clans', to: '/clans', page: true },
      { label: 'Hunt Tracker', to: '/hunt', page: true },
      { label: 'Players', to: '/players', page: true },
      { label: 'Achievements', to: '/achievements', page: true },
    ],
  },
]

function Dropdown({ group, path, onNavigate }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const anyActive = group.items.some((i) => i.page && path === i.to)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="nav__dd" ref={ref}>
      <button
        className={`nav__dd-btn ${anyActive ? 'nav__link--on' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {group.label}
        <span className={`nav__dd-caret ${open ? 'nav__dd-caret--open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="nav__dd-menu">
          {group.items.map((item) => {
            const active = item.page && path === item.to
            const lp = linkProps(item.to)
            return (
              <a
                key={item.to}
                {...lp}
                className={`nav__dd-item ${active ? 'nav__dd-item--on' : ''}`}
                onClick={(e) => {
                  lp.onClick(e)
                  setOpen(false)
                  onNavigate()
                }}
              >
                {item.label}
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
            {NAV_GROUPS.map((group) => (
              <Dropdown key={group.label} group={group} path={path} onNavigate={() => setOpen(false)} />
            ))}
            {user?.role === 'admin' && (
              <a
                {...linkProps('/admin')}
                className={path === '/admin' ? 'nav__link--on' : undefined}
                aria-current={path === '/admin' ? 'page' : undefined}
                onClick={(e) => {
                  linkProps('/admin').onClick(e)
                  setOpen(false)
                }}
              >
                Admin
              </a>
            )}
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
