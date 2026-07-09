import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { servers } from '../data/servers.js'
import { apiSend } from '../lib/api.js'
import { linkProps } from '../lib/router.js'
import Badges from './Badges.jsx'

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

const PROVIDER_LABEL = { discord: 'Discord', steam: 'Steam' }
const providerLabel = (p) => PROVIDER_LABEL[p] || p

function ProviderChip({ provider }) {
  return <span className={`provider provider--${provider}`}>{providerLabel(provider)}</span>
}

// Link / unlink Discord + Steam to this one account. Linking is a full-page OAuth
// round-trip (so the session cookie travels); unlinking is a same-origin POST.
function ConnectedAccounts({ user, providers, onChange }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const linked = new Set((user.identities || []).map((i) => i.provider))
  // Show any provider that's either enabled on the site or already linked.
  const rows = ['discord', 'steam'].filter((p) => providers?.[p] || linked.has(p))

  async function unlink(provider) {
    setBusy(provider)
    setErr('')
    try {
      await apiSend('POST', '/api/me/unlink', { provider })
      await onChange()
    } catch (e) {
      setErr(e.message || 'Could not unlink — try again.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="pf__rolesblock">
      <span className="pf__roleslabel">Connected accounts</span>
      <div className="pf__accounts">
        {rows.map((p) => {
          const isLinked = linked.has(p)
          const isPrimary = user.provider === p
          return (
            <div className="pf__account" key={p}>
              <ProviderChip provider={p} />
              {isLinked ? (
                <span className="pf__account-state">
                  Connected{isPrimary && <span className="pf__account-primary"> · primary</span>}
                </span>
              ) : (
                <a className="btn btn--sm" href={`/auth/${p}/link`}>
                  Link {providerLabel(p)}
                </a>
              )}
              {isLinked && !isPrimary && (
                <button className="linkbtn linkbtn--danger" onClick={() => unlink(p)} disabled={busy === p}>
                  {busy === p ? 'Unlinking…' : 'Unlink'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {err && <p className="cform__err">{err}</p>}
      <p className="pf__accounts-hint">
        Link both so your Steam playtime shows up on your profile and one login gets you everything.
      </p>
    </div>
  )
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
  const { user, providers, logout, refresh } = useAuth()
  const [editingProfile, setEditingProfile] = useState(false)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!open) {
      setEditingProfile(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !user) return null

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal__card modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

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

            {user.badges?.length > 0 && (
              <div className="pf__rolesblock">
                <span className="pf__roleslabel">Achievements</span>
                <Badges badges={user.badges} />
              </div>
            )}

            <ConnectedAccounts user={user} providers={providers} onChange={refresh} />

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
              {user.key && (
                <a className="btn btn--ghost btn--sm" {...linkProps(`/u/${user.key}`)} onClickCapture={onClose}>
                  My public profile
                </a>
              )}
              {user.profileUrl && (
                <a className="btn btn--ghost btn--sm" href={user.profileUrl} target="_blank" rel="noreferrer">
                  View Steam profile
                </a>
              )}
              {isAdmin && (
                <a
                  className="btn btn--ghost btn--sm"
                  {...linkProps('/admin')}
                  onClickCapture={onClose}
                >
                  Admin panel
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
      </div>
    </div>
  )
}
