import { useEffect, useMemo, useState } from 'react'
import { servers } from '../data/servers.js'
import { linkProps } from '../lib/router.js'
import Badges from './Badges.jsx'

function serverName(id) {
  return servers.find((s) => s.id === id)?.name || id
}

function RoleTags({ roles }) {
  const named = (roles || []).filter((r) => r.name)
  if (!named.length) return null
  return (
    <div className="mroster__roles">
      {named.slice(0, 3).map((r) => (
        <span
          key={r.id}
          className="rtag"
          style={r.color ? { '--rc': r.color } : undefined}
        >
          {r.name}
        </span>
      ))}
    </div>
  )
}

function Avatar({ m }) {
  if (m.avatar) return <img className="mroster__avatar" src={m.avatar} alt="" loading="lazy" />
  return (
    <span className="mroster__avatar mroster__avatar--ph">
      {m.username?.[0]?.toUpperCase() || '?'}
    </span>
  )
}

const FILTERS = [
  ['all', 'Everyone'],
  ['admin', 'Admins'],
  ['member', 'Members'],
]

export default function Members() {
  const [members, setMembers] = useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    fetch('/api/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers(d.members || []))
      .catch(() => setMembers([]))
  }, [])

  const shown = useMemo(() => {
    if (!members) return []
    const q = query.trim().toLowerCase()
    return members.filter((m) => {
      if (filter === 'admin' && m.role !== 'admin') return false
      if (filter === 'member' && m.role === 'admin') return false
      if (q && !m.username?.toLowerCase().includes(q)) return false
      return true
    })
  }, [members, query, filter])

  const total = members?.length || 0

  return (
    <section className="section section--alt" id="members">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">The crew</p>
          <h2 className="section__title">Community members</h2>
          <p className="section__lead">
            {members === null
              ? 'Loading the roster…'
              : total === 0
                ? 'No members yet — be the first to sign in!'
                : `${total} legends have joined, in order of arrival.`}
          </p>
        </div>

        {members && total > 0 && (
          <>
            <div className="mfilter">
              <input
                className="mfilter__search"
                type="search"
                placeholder="Search members…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search members by name"
              />
              <div className="mfilter__tabs">
                {FILTERS.map(([val, label]) => (
                  <button
                    key={val}
                    className={`mfilter__tab ${filter === val ? 'mfilter__tab--on' : ''}`}
                    onClick={() => setFilter(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <p className="empty">No members match your search.</p>
            ) : (
              <div className="mroster">
                {shown.map((m, i) => (
                  <article className="mroster__card" key={m.key}>
                    <span className={`mroster__rank ${i < 3 && filter === 'all' && !query ? 'mroster__rank--top' : ''}`}>
                      #{members.indexOf(m) + 1}
                    </span>
                    <Avatar m={m} />
                    <div className="mroster__info">
                      <span className="mroster__name">
                        {m.username}
                        {m.role === 'admin' && <span className="badge badge--admin">Admin</span>}
                      </span>
                      <span className={`provider provider--${m.provider}`}>
                        {m.provider === 'discord' ? 'Discord' : m.provider === 'steam' ? 'Steam' : m.provider}
                      </span>
                      <RoleTags roles={m.discordRoles} />
                      <Badges badges={m.badges} size="sm" max={4} />
                      {m.favoriteServer && (
                        <span className="mroster__fav">★ {serverName(m.favoriteServer)}</span>
                      )}
                      {m.bio && <p className="mroster__bio">{m.bio}</p>}
                      <a className="mroster__view" {...linkProps(`/u/${m.key}`)}>
                        View profile →
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
