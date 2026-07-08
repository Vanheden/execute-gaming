import { useEffect, useState } from 'react'

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

export default function Members() {
  const [members, setMembers] = useState(null)

  useEffect(() => {
    fetch('/api/members')
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers(d.members || []))
      .catch(() => setMembers([]))
  }, [])

  return (
    <section className="section section--alt" id="members">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">The crew</p>
          <h2 className="section__title">Community members</h2>
          <p className="section__lead">
            {members === null
              ? 'Loading the roster…'
              : members.length === 0
                ? 'No members yet — be the first to sign in!'
                : `${members.length} legends have joined, in order of arrival.`}
          </p>
        </div>

        {members && members.length > 0 && (
          <div className="mroster">
            {members.map((m, i) => (
              <article className="mroster__card" key={m.key}>
                <span className={`mroster__rank ${i < 3 ? 'mroster__rank--top' : ''}`}>
                  #{i + 1}
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
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
