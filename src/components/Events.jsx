import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiGet, apiSend } from '../lib/api.js'
import { useConfirm } from './ConfirmProvider.jsx'

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// <input type="datetime-local"> wants "YYYY-MM-DDTHH:mm" in local time.
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function EventForm({ initial, onClose, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt))
  const [location, setLocation] = useState(initial?.location || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const payload = { title, startsAt: new Date(startsAt).toISOString(), location, description }
    try {
      const data = initial
        ? await apiSend('PUT', `/api/events/${initial.id}`, payload)
        : await apiSend('POST', '/api/events', payload)
      onSaved(data.event, !!initial)
      onClose()
    } catch {
      setErr('Could not save the event.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <form className="modal__card modal__card--wide cform" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
        <h3 className="modal__title">{initial ? 'Edit event' : 'New event'}</h3>
        <label className="cform__label">Title</label>
        <input className="cform__input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required />
        <label className="cform__label">Date &amp; time</label>
        <input className="cform__input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
        <label className="cform__label">Where (optional)</label>
        <input className="cform__input" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={140} placeholder="e.g. Duo PvP server / Discord" />
        <label className="cform__label">Description (optional)</label>
        <textarea className="cform__input cform__textarea" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} />
        {err && <p className="cform__err">{err}</p>}
        <div className="cform__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Save event'}</button>
        </div>
      </form>
    </div>
  )
}

function EventCard({ ev, past, isAdmin, onEdit, onDelete }) {
  const d = new Date(ev.startsAt)
  return (
    <article className={`event ${past ? 'event--past' : ''}`}>
      <div className="event__date">
        <span className="event__day">{d.toLocaleDateString(undefined, { day: 'numeric' })}</span>
        <span className="event__mon">{d.toLocaleDateString(undefined, { month: 'short' })}</span>
      </div>
      <div className="event__info">
        <h3 className="event__title">{ev.title}</h3>
        <p className="event__when">{fmt(ev.startsAt)}{ev.location ? ` · ${ev.location}` : ''}</p>
        {ev.description && <p className="event__desc">{ev.description}</p>}
        {isAdmin && (
          <div className="news__admin">
            <button className="linkbtn" onClick={() => onEdit(ev)}>Edit</button>
            <button className="linkbtn linkbtn--danger" onClick={() => onDelete(ev.id)}>Delete</button>
          </div>
        )}
      </div>
    </article>
  )
}

export default function Events() {
  const { user } = useAuth()
  const { confirm } = useConfirm()
  const isAdmin = user?.role === 'admin'
  const [events, setEvents] = useState(null)
  const [editing, setEditing] = useState(undefined)

  useEffect(() => {
    apiGet('/api/events').then((d) => setEvents(d.events)).catch(() => setEvents([]))
  }, [])

  function onSaved(ev, wasEdit) {
    setEvents((es) => {
      const next = wasEdit ? es.map((e) => (e.id === ev.id ? ev : e)) : [...es, ev]
      return next.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    })
  }

  async function remove(id) {
    const ok = await confirm({
      title: 'Delete event?',
      message: 'This permanently removes the event.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await apiSend('DELETE', `/api/events/${id}`)
      setEvents((es) => es.filter((e) => e.id !== id))
    } catch {
      /* ignore */
    }
  }

  const nowMs = Date.now()
  const upcoming = (events || []).filter((e) => new Date(e.startsAt).getTime() >= nowMs)
  const past = (events || []).filter((e) => new Date(e.startsAt).getTime() < nowMs).reverse()

  return (
    <section className="section" id="events">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">What's on</p>
          <h2 className="section__title">Events &amp; tournaments</h2>
          <p className="section__lead">Wipe dates, in-house games, and community nights.</p>
          {isAdmin && (
            <button className="btn btn--sm" style={{ marginTop: 18 }} onClick={() => setEditing(null)}>
              + New event
            </button>
          )}
        </div>

        {events && upcoming.length === 0 && <p className="empty">No upcoming events scheduled.</p>}

        <div className="events">
          {upcoming.map((ev) => (
            <EventCard key={ev.id} ev={ev} isAdmin={isAdmin} onEdit={setEditing} onDelete={remove} />
          ))}
        </div>

        {past.length > 0 && (
          <>
            <h3 className="events__pasthead">Past events</h3>
            <div className="events">
              {past.map((ev) => (
                <EventCard key={ev.id} ev={ev} past isAdmin={isAdmin} onEdit={setEditing} onDelete={remove} />
              ))}
            </div>
          </>
        )}
      </div>

      {editing !== undefined && (
        <EventForm initial={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} />
      )}
    </section>
  )
}
