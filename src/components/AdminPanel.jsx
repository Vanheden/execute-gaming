import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiSend } from '../lib/api.js'
import { ACHIEVEMENTS, GRANTABLE } from '../data/achievements.js'
import { linkProps } from '../lib/router.js'
import Badges from './Badges.jsx'
import { useConfirm } from './ConfirmProvider.jsx'

function Avatar({ user, size = 38 }) {
  const style = { width: size, height: size }
  if (user.avatar) return <img className="pf__avatar" style={style} src={user.avatar} alt="" />
  return (
    <span className="pf__avatar pf__avatar--ph" style={style}>
      {user.username?.[0]?.toUpperCase() || '?'}
    </span>
  )
}

function timeAgo(iso) {
  const d = new Date(iso)
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// --- Per-member expandable admin actions -----------------------------------
function MemberRow({ m, currentUser, onPatch }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(m.note || '')
  const [grant, setGrant] = useState('')
  const { confirm, prompt } = useConfirm()
  const isSelf = m.id === currentUser.id

  const granted = (m.badges || []).filter((b) => GRANTABLE.includes(b.code)).map((b) => b.code)
  const grantable = GRANTABLE.filter((c) => !granted.includes(c))

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  const toggleBan = () =>
    run(async () => {
      let reason = null
      if (!m.banned) {
        reason = await prompt({
          title: `Ban ${m.username}?`,
          message: "They'll be hidden from the roster and logged out on their next login.",
          placeholder: 'Reason (optional)',
          confirmLabel: 'Ban',
          danger: true,
        })
        if (reason === null) return // cancelled
      } else if (!(await confirm({ title: `Unban ${m.username}?`, confirmLabel: 'Unban' }))) {
        return
      }
      const { user } = await apiSend('POST', `/api/admin/users/${encodeURIComponent(m.id)}/ban`, {
        banned: !m.banned,
        reason,
      })
      onPatch(m.id, { banned: user.banned, banReason: user.banReason })
    })

  const saveNote = () =>
    run(async () => {
      await apiSend('POST', `/api/admin/users/${encodeURIComponent(m.id)}/note`, { note })
      onPatch(m.id, { note })
    })

  const doGrant = () =>
    run(async () => {
      if (!grant) return
      const { badges } = await apiSend(
        'POST',
        `/api/admin/users/${encodeURIComponent(m.id)}/achievements`,
        { code: grant },
      )
      onPatch(m.id, { badges })
      setGrant('')
    })

  const doRevoke = (code) =>
    run(async () => {
      const { badges } = await apiSend(
        'DELETE',
        `/api/admin/users/${encodeURIComponent(m.id)}/achievements/${encodeURIComponent(code)}`,
      )
      onPatch(m.id, { badges })
    })

  return (
    <div className={`amrow ${m.banned ? 'amrow--banned' : ''}`}>
      <button className="amrow__head" onClick={() => setOpen((o) => !o)}>
        <Avatar user={m} />
        <span className="amrow__info">
          <span className="amrow__name">
            {m.username}
            {isSelf && <span className="member__you">you</span>}
            {m.banned && <span className="badge badge--banned">Banned</span>}
          </span>
          <span className={`provider provider--${m.provider}`}>{m.provider}</span>
        </span>
        <span className={`badge ${m.role === 'admin' ? 'badge--admin' : 'badge--member'}`}>{m.role}</span>
        <span className="amrow__chev" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="amrow__body">
          {m.banReason && <p className="amrow__banreason">Ban reason: {m.banReason}</p>}

          <div className="amrow__section">
            <span className="amrow__label">Badges</span>
            {granted.length > 0 ? (
              <div className="amrow__badges">
                {(m.badges || [])
                  .filter((b) => GRANTABLE.includes(b.code))
                  .map((b) => (
                    <button
                      key={b.code}
                      className="ach ach--revoke"
                      disabled={busy}
                      title="Click to revoke"
                      onClick={() => doRevoke(b.code)}
                    >
                      <span aria-hidden="true">{b.icon}</span> {b.name} ✕
                    </button>
                  ))}
              </div>
            ) : (
              <span className="amrow__muted">No granted badges yet.</span>
            )}
            {grantable.length > 0 && (
              <div className="amrow__grant">
                <select className="cform__input" value={grant} onChange={(e) => setGrant(e.target.value)}>
                  <option value="">Grant a badge…</option>
                  {grantable.map((c) => (
                    <option key={c} value={c}>
                      {ACHIEVEMENTS[c].icon} {ACHIEVEMENTS[c].name}
                    </option>
                  ))}
                </select>
                <button className="btn btn--sm" disabled={busy || !grant} onClick={doGrant}>
                  Grant
                </button>
              </div>
            )}
          </div>

          <div className="amrow__section">
            <span className="amrow__label">Private note</span>
            <textarea
              className="cform__input cform__textarea"
              rows={2}
              maxLength={1000}
              value={note}
              placeholder="Only admins can see this…"
              onChange={(e) => setNote(e.target.value)}
            />
            <button className="btn btn--ghost btn--sm" disabled={busy || note === (m.note || '')} onClick={saveNote}>
              Save note
            </button>
          </div>

          <div className="amrow__actions">
            <a className="linkbtn" {...linkProps(`/u/${m.key}`)}>
              View public profile ↗
            </a>
            <div className="amrow__actions-r">
              {m.role === 'admin' && <span className="amrow__muted">Admin via .env</span>}
              {!isSelf && (
                <button className={`btn btn--sm ${m.banned ? '' : 'btn--danger'}`} disabled={busy} onClick={toggleBan}>
                  {m.banned ? 'Unban' : 'Ban'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Members sub-tab --------------------------------------------------------
function MembersTab({ currentUser }) {
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    apiGet('/api/admin/users')
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]))
  }, [])

  const shown = useMemo(() => {
    if (!users) return []
    const s = q.trim().toLowerCase()
    return s ? users.filter((u) => u.username?.toLowerCase().includes(s)) : users
  }, [users, q])

  function onPatch(id, patch) {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }

  if (users === null) return <p className="empty">Loading members…</p>

  return (
    <div className="amtab">
      <input
        className="mfilter__search"
        type="search"
        placeholder="Search members…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <p className="amtab__count">
        {users.length} registered · {users.filter((u) => u.role === 'admin').length} admins ·{' '}
        {users.filter((u) => u.banned).length} banned
      </p>
      <div className="amlist">
        {shown.map((m) => (
          <MemberRow key={m.id} m={m} currentUser={currentUser} onPatch={onPatch} />
        ))}
        {shown.length === 0 && <p className="empty">No members match.</p>}
      </div>
    </div>
  )
}

// --- Audit sub-tab ----------------------------------------------------------
const ACTION_LABEL = {
  'role.set': 'changed role',
  'user.ban': 'banned',
  'user.unban': 'unbanned',
  'user.note': 'edited note for',
  'achievement.grant': 'granted badge to',
  'achievement.revoke': 'revoked badge from',
  'announcement.set': 'set the announcement',
  'announcement.clear': 'cleared the announcement',
}

function AuditTab() {
  const [entries, setEntries] = useState(null)
  useEffect(() => {
    apiGet('/api/admin/audit?limit=200')
      .then((d) => setEntries(d.entries || []))
      .catch(() => setEntries([]))
  }, [])

  if (entries === null) return <p className="empty">Loading audit log…</p>
  if (entries.length === 0) return <p className="empty">No admin actions recorded yet.</p>

  return (
    <div className="amtab">
      <ul className="audit">
        {entries.map((e) => (
          <li key={e.id} className="audit__row">
            <span className="audit__time" title={new Date(e.at).toLocaleString()}>
              {timeAgo(e.at)}
            </span>
            <span className="audit__text">
              <strong>{e.actorName || 'system'}</strong> {ACTION_LABEL[e.action] || e.action}
              {e.targetName && <strong> {e.targetName}</strong>}
              {e.detail && <span className="audit__detail"> · {e.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// --- Analytics sub-tab ------------------------------------------------------
function AnalyticsTab() {
  const [data, setData] = useState(null)
  useEffect(() => {
    apiGet('/api/admin/analytics?days=30')
      .then(setData)
      .catch(() => setData({ total: 0, perDay: [], topPaths: [] }))
  }, [])

  if (data === null) return <p className="empty">Loading analytics…</p>

  const maxDay = Math.max(1, ...data.perDay.map((d) => d.views))
  const maxPath = Math.max(1, ...data.topPaths.map((p) => p.views))

  return (
    <div className="amtab">
      <p className="amtab__count">
        <strong className="an__total">{data.total.toLocaleString()}</strong> page views · last {data.days} days
      </p>

      {data.perDay.length === 0 ? (
        <p className="empty">No traffic recorded yet.</p>
      ) : (
        <div className="an__chart" role="img" aria-label="Daily page views">
          {data.perDay.map((d) => (
            <div key={d.day} className="an__bar" title={`${d.day}: ${d.views} views`}>
              <span className="an__barfill" style={{ height: `${(d.views / maxDay) * 100}%` }} />
            </div>
          ))}
        </div>
      )}

      {data.topPaths.length > 0 && (
        <>
          <span className="amrow__label" style={{ marginTop: 16 }}>
            Top pages
          </span>
          <ul className="an__paths">
            {data.topPaths.map((p) => (
              <li key={p.path} className="an__path">
                <span className="an__pathbar" style={{ width: `${(p.views / maxPath) * 100}%` }} />
                <span className="an__pathname">{p.path}</span>
                <span className="an__pathviews">{p.views.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// --- Panel shell ------------------------------------------------------------
const TABS = [
  ['members', 'Members'],
  ['audit', 'Audit log'],
  ['analytics', 'Analytics'],
]

export default function AdminPanel({ currentUser }) {
  const [sub, setSub] = useState('members')
  return (
    <div className="admin">
      <div className="tabs tabs--sub">
        {TABS.map(([val, label]) => (
          <button
            key={val}
            className={`tab ${sub === val ? 'tab--on' : ''}`}
            onClick={() => setSub(val)}
          >
            {label}
          </button>
        ))}
      </div>
      {sub === 'members' && <MembersTab currentUser={currentUser} />}
      {sub === 'audit' && <AuditTab />}
      {sub === 'analytics' && <AnalyticsTab />}
    </div>
  )
}
