import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiGet, apiSend } from '../lib/api.js'

const LEVELS = [
  ['info', 'Info'],
  ['warning', 'Warning'],
  ['critical', 'Critical'],
]

// Remember which announcement the visitor dismissed (keyed by its timestamp, so
// a brand-new announcement shows again even if they closed the previous one).
function dismissedKey(a) {
  return `eg-ann-dismissed:${a?.updatedAt || ''}`
}

function AdminEditor({ current, onClose, onSaved }) {
  const [message, setMessage] = useState(current?.message || '')
  const [level, setLevel] = useState(current?.level || 'info')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save(clear) {
    setBusy(true)
    setErr('')
    try {
      const data = await apiSend('PUT', '/api/announcement', {
        message: clear ? '' : message,
        level,
      })
      onSaved(data.announcement)
      onClose()
    } catch {
      setErr('Could not save — check you are still logged in as admin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <form
        className="modal__card cform"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
      >
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="modal__title">Site announcement</h3>
        <p className="modal__lead" style={{ margin: '0 0 16px' }}>
          Shown as a banner at the top of the site for everyone.
        </p>
        <label className="cform__label">Message</label>
        <textarea
          className="cform__input cform__textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={280}
          placeholder="e.g. PvE server wipes Friday 20:00 CET"
          required
        />
        <label className="cform__label">Style</label>
        <div className="annedit__levels">
          {LEVELS.map(([val, label]) => (
            <button
              type="button"
              key={val}
              className={`annedit__level annedit__level--${val} ${level === val ? 'annedit__level--on' : ''}`}
              onClick={() => setLevel(val)}
            >
              {label}
            </button>
          ))}
        </div>
        {err && <p className="cform__err">{err}</p>}
        <div className="cform__actions">
          {current && (
            <button
              type="button"
              className="linkbtn linkbtn--danger"
              style={{ marginRight: 'auto' }}
              disabled={busy}
              onClick={() => save(true)}
            >
              Clear banner
            </button>
          )}
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--sm" disabled={busy}>
            {busy ? 'Saving…' : 'Publish'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function AnnouncementBanner() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [announcement, setAnnouncement] = useState(null)
  const [dismissed, setDismissed] = useState(false)
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    apiGet('/api/announcement')
      .then((d) => {
        setAnnouncement(d.announcement)
        if (d.announcement) {
          setDismissed(localStorage.getItem(dismissedKey(d.announcement)) === '1')
        }
      })
      .catch(() => {})
  }, [])

  const visible = announcement && !dismissed

  // Push the fixed navbar down by the banner's height while it's visible.
  useLayoutEffect(() => {
    const root = document.documentElement
    if (visible && ref.current) {
      const setH = () => root.style.setProperty('--banner-h', `${ref.current.offsetHeight}px`)
      setH()
      document.body.classList.add('has-banner')
      const ro = new ResizeObserver(setH)
      ro.observe(ref.current)
      return () => {
        ro.disconnect()
        document.body.classList.remove('has-banner')
        root.style.removeProperty('--banner-h')
      }
    }
    document.body.classList.remove('has-banner')
    root.style.removeProperty('--banner-h')
  }, [visible])

  function dismiss() {
    if (announcement) localStorage.setItem(dismissedKey(announcement), '1')
    setDismissed(true)
  }

  function onSaved(next) {
    setAnnouncement(next)
    setDismissed(false) // show the freshly-published banner to the admin too
  }

  // Admins always get a way in, even when no banner is set.
  if (!announcement && !isAdmin) return null

  return (
    <>
      {visible ? (
        <div ref={ref} className={`annbar annbar--${announcement.level}`} role="status">
          <div className="annbar__inner container">
            <span className="annbar__dot" aria-hidden="true" />
            <p className="annbar__msg">{announcement.message}</p>
            {isAdmin && (
              <button className="annbar__edit" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button className="annbar__close" onClick={dismiss} aria-label="Dismiss">
              ×
            </button>
          </div>
        </div>
      ) : (
        isAdmin && (
          <button className="annbar__admin-add" onClick={() => setEditing(true)}>
            {announcement ? '📢 Announcement (hidden — you dismissed it)' : '📢 Set site announcement'}
          </button>
        )
      )}

      {editing && (
        <AdminEditor current={announcement} onClose={() => setEditing(false)} onSaved={onSaved} />
      )}
    </>
  )
}
