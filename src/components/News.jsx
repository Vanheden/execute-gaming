import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiGet, apiSend } from '../lib/api.js'

function fmt(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function PostForm({ initial, onClose, onSaved }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [body, setBody] = useState(initial?.body || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      const data = initial
        ? await apiSend('PUT', `/api/news/${initial.id}`, { title, body })
        : await apiSend('POST', '/api/news', { title, body })
      onSaved(data.post, !!initial)
      onClose()
    } catch {
      setErr('Could not save — check you are still logged in as admin.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal" onClick={onClose} role="dialog" aria-modal="true">
      <form className="modal__card modal__card--wide cform" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3 className="modal__title">{initial ? 'Edit post' : 'New post'}</h3>
        <label className="cform__label">Title</label>
        <input className="cform__input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} required />
        <label className="cform__label">Body</label>
        <textarea className="cform__input cform__textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={6} maxLength={8000} required />
        {err && <p className="cform__err">{err}</p>}
        <div className="cform__actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--sm" disabled={busy}>{busy ? 'Saving…' : 'Publish'}</button>
        </div>
      </form>
    </div>
  )
}

export default function News() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [posts, setPosts] = useState(null)
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new, obj = edit

  useEffect(() => {
    apiGet('/api/news').then((d) => setPosts(d.news)).catch(() => setPosts([]))
  }, [])

  function onSaved(post, wasEdit) {
    setPosts((ps) => (wasEdit ? ps.map((p) => (p.id === post.id ? post : p)) : [post, ...ps]))
  }

  async function remove(id) {
    if (!confirm('Delete this post?')) return
    try {
      await apiSend('DELETE', `/api/news/${id}`)
      setPosts((ps) => ps.filter((p) => p.id !== id))
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="section section--alt" id="news">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Latest</p>
          <h2 className="section__title">News &amp; patch notes</h2>
          <p className="section__lead">Updates, wipe announcements, and everything happening in the community.</p>
          {isAdmin && (
            <button className="btn btn--sm" style={{ marginTop: 18 }} onClick={() => setEditing(null)}>
              + New post
            </button>
          )}
        </div>

        {posts && posts.length === 0 && <p className="empty">No news yet. Check back soon!</p>}

        <div className="news">
          {(posts || []).map((p) => (
            <article className="news__item" key={p.id}>
              <div className="news__meta">
                <time>{fmt(p.createdAt)}</time>
                {p.authorName && <span>· {p.authorName}</span>}
                {p.updatedAt && p.updatedAt !== p.createdAt && <span className="news__edited">· edited</span>}
              </div>
              <h3 className="news__title">{p.title}</h3>
              <p className="news__body">{p.body}</p>
              {isAdmin && (
                <div className="news__admin">
                  <button className="linkbtn" onClick={() => setEditing(p)}>Edit</button>
                  <button className="linkbtn linkbtn--danger" onClick={() => remove(p.id)}>Delete</button>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>

      {editing !== undefined && (
        <PostForm initial={editing} onClose={() => setEditing(undefined)} onSaved={onSaved} />
      )}
    </section>
  )
}
