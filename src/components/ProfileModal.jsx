import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { servers } from '../data/servers.js'
import { apiSend } from '../lib/api.js'

function serverName(id) {
  return servers.find((s) => s.id === id)?.name || id
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function Avatar({ user, size }) {
  const style = { width: size, height: size }
  if (user.avatar) return <img className="pf__avatar" style={style} src={user.avatar} alt="" />
  return (
    <span className="pf__avatar pf__avatar--ph" style={style}>
      {user.username?.[0]?.toUpperCase() || '?'}
    </span>
  )
}

function ProviderChip({ provider }) {
  const label = provider === 'discord' ? 'Discord' : provider === 'steam' ? 'Steam' : provider
  return <span className={`provider provider--${provider}`}>{label}</span>
}

function ProfileEditForm({ user, onCancel, onSaved }) {
  const [bio, setBio] = useState(user.bio || '')
  const [favoriteServer, setFavoriteServer] = useState(user.favoriteServer || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await apiSend('PUT', '/api/me/profile', { bio, favoriteServer })
      await onSaved()
    } catch {
      setErr('Could not save — try again.')
      setBusy(false)
    }
  }

  return (
    <form className="cform pf__editform" onSubmit={submit}>
      <label className="cform__label">Bio</label>
      <textarea
        className="cform__input cform__textarea"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder="A few words about you…"
      />
      <label className="cform__label">Favourite server</label>
      <select
        className="cform__input"
        value={favoriteServer}
        onChange={(e) => setFavoriteServer(e.target.value)}
      >
        <option value="">— none —</option>
        {servers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {err && <p className="cform__err">{err}</p>}
      <div className="cform__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn--sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  )
}

export default function ProfileModal({ open, onClose }) {
  const { user, logout, refresh } = useAuth()
  const [tab, setTab] = useState('profile')
  const [members, setMembers] = useState(null)
  const [busy, setBusy] = useState('')
  const [editingProfile, setEditingProfile] = useState(false)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!open) {
      setTab('profile')
      setMembers(null)
      setEditingProfile(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open && isAdmin && tab === 'admin' && members === null) {
      fetch('/api/admin/users', { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { users: [] }))
        .then((d) => setMembers(d.users || []))
        .catch(() => setMembers([]))
    }
  }, [open, isAdmin, tab, members])

  if (!open || !user) return null

  async function changeRole(id, role) {
    setBusy(id)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(id)}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      })
      if (res.ok) {
        setMembers((ms) => ms.map((m) => (m.id === id ? { ...m, role } : m)))
      }
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__card modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {isAdmin && (
          <div className="tabs">
            <button
              className={`tab ${tab === 'profile' ? 'tab--on' : ''}`}
              onClick={() => setTab('profile')}
            >
              Profile
            </button>
            <button
              className={`tab ${tab === 'admin' ? 'tab--on' : ''}`}
              onClick={() => setTab('admin')}
            >
              Members
            </button>
          </div>
        )}

        {tab === 'profile' && (
          <div className="pf">
            <div className="pf__head">
              <Avatar user={user} size={72} />
              <div>
                <h3 className="pf__name">
                  {user.username}
                  {isAdmin && <span className="badge badge--admin">Admin</span>}
                </h3>
                <ProviderChip provider={user.provider} />
              </div>
            </div>

            <dl className="pf__meta">
              <div>
                <dt>Signed in with</dt>
                <dd style={{ textTransform: 'capitalize' }}>{user.provider}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd style={{ textTransform: 'capitalize' }}>{user.role}</dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
              <div>
                <dt>Last login</dt>
                <dd>{formatDate(user.lastLogin)}</dd>
              </div>
            </dl>

            {user.discordRoles?.some((r) => r.name) && (
              <div className="pf__rolesblock">
                <span className="pf__roleslabel">Discord roles</span>
                <div className="mroster__roles">
                  {user.discordRoles
                    .filter((r) => r.name)
                    .map((r) => (
                      <span
                        key={r.id}
                        className="rtag"
                        style={r.color ? { '--rc': r.color } : undefined}
                      >
                        {r.name}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {editingProfile ? (
              <ProfileEditForm
                user={user}
                onCancel={() => setEditingProfile(false)}
                onSaved={async () => {
                  await refresh()
                  setEditingProfile(false)
                }}
              />
            ) : (
              <div className="pf__about">
                <div className="pf__aboutrow">
                  <span className="pf__roleslabel">About me</span>
                  <button className="linkbtn" onClick={() => setEditingProfile(true)}>
                    Edit profile
                  </button>
                </div>
                <p className="pf__bio">
                  {user.bio || <span className="pf__bio--empty">No bio yet — tell the crew about yourself.</span>}
                </p>
                {user.favoriteServer && (
                  <p className="pf__fav">
                    <span className="pf__roleslabel">Favourite server</span>
                    {serverName(user.favoriteServer)}
                  </p>
                )}
              </div>
            )}

            <div className="pf__actions">
              {user.profileUrl && (
                <a className="btn btn--ghost btn--sm" href={user.profileUrl} target="_blank" rel="noreferrer">
                  View Steam profile
                </a>
              )}
              <button
                className="btn btn--sm"
                onClick={() => {
                  logout()
                  onClose()
                }}
              >
                Log out
              </button>
            </div>
          </div>
        )}

        {tab === 'admin' && isAdmin && (
          <div className="members">
            <h3 className="pf__name" style={{ marginBottom: 4 }}>
              Members
            </h3>
            <p className="modal__lead" style={{ margin: '0 0 16px' }}>
              {members ? `${members.length} registered` : 'Loading…'}
            </p>
            <div className="members__list">
              {(members || []).map((m) => (
                <div key={m.id} className="member">
                  <Avatar user={m} size={38} />
                  <div className="member__info">
                    <span className="member__name">
                      {m.username}
                      {m.id === user.id && <span className="member__you">you</span>}
                    </span>
                    <ProviderChip provider={m.provider} />
                  </div>
                  <span className={`badge ${m.role === 'admin' ? 'badge--admin' : 'badge--member'}`}>
                    {m.role}
                  </span>
                  {m.role === 'admin' ? (
                    <button
                      className="member__btn"
                      disabled={busy === m.id}
                      onClick={() => changeRole(m.id, 'member')}
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      className="member__btn member__btn--up"
                      disabled={busy === m.id}
                      onClick={() => changeRole(m.id, 'admin')}
                    >
                      Make admin
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
