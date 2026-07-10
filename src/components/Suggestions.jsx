import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { apiGet, apiSend } from '../lib/api.js'
import { useConfirm } from './ConfirmProvider.jsx'
import Turnstile from './Turnstile.jsx'

const STATUSES = ['open', 'planned', 'done', 'declined']

export default function Suggestions() {
  const { user, turnstile } = useAuth()
  const { confirm } = useConfirm()
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState(null)
  const [captchaReset, setCaptchaReset] = useState(0)
  const onVerify = useCallback((t) => setToken(t), [])
  const gated = turnstile?.enabled

  function load() {
    apiGet('/api/suggestions').then((d) => setItems(d.suggestions)).catch(() => setItems([]))
  }
  useEffect(load, [user]) // reload when auth resolves so hasVoted is accurate

  async function submit(e) {
    e.preventDefault()
    if (!title.trim()) return
    if (gated && !token) return
    setBusy(true)
    try {
      const { suggestion } = await apiSend('POST', '/api/suggestions', {
        title,
        body,
        turnstileToken: token,
      })
      setItems((s) => [{ ...suggestion, votes: 0, hasVoted: false }, ...s])
      setTitle('')
      setBody('')
    } catch {
      /* ignore */
    } finally {
      setBusy(false)
      // The token is single-use once the server verifies it — get a fresh one.
      if (gated) {
        setToken(null)
        setCaptchaReset((n) => n + 1)
      }
    }
  }

  async function vote(id) {
    if (!user) return
    // optimistic
    setItems((s) =>
      s.map((it) =>
        it.id === id ? { ...it, hasVoted: !it.hasVoted, votes: it.votes + (it.hasVoted ? -1 : 1) } : it,
      ),
    )
    try {
      await apiSend('POST', `/api/suggestions/${id}/vote`)
    } catch {
      load() // revert on failure
    }
  }

  async function changeStatus(id, status) {
    try {
      await apiSend('PATCH', `/api/suggestions/${id}/status`, { status })
      setItems((s) => s.map((it) => (it.id === id ? { ...it, status } : it)))
    } catch {
      /* ignore */
    }
  }

  async function remove(id) {
    const ok = await confirm({
      title: 'Delete suggestion?',
      message: 'This permanently removes the suggestion and its votes.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    try {
      await apiSend('DELETE', `/api/suggestions/${id}`)
      setItems((s) => s.filter((it) => it.id !== id))
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="section" id="suggestions">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Your voice</p>
          <h2 className="section__title">Suggestions</h2>
          <p className="section__lead">Got an idea for the servers or community? Post it and vote on others.</p>
        </div>

        {user ? (
          <form className="sugg__form" onSubmit={submit}>
            <input
              className="cform__input"
              placeholder="Your idea in one line…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              required
            />
            <textarea
              className="cform__input cform__textarea"
              placeholder="Details (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={2000}
            />
            {gated && <Turnstile onVerify={onVerify} resetSignal={captchaReset} />}
            <div className="cform__actions">
              <button className="btn btn--sm" disabled={busy || (gated && !token)}>
                {busy ? 'Posting…' : 'Post suggestion'}
              </button>
            </div>
          </form>
        ) : (
          <p className="empty">Log in to post a suggestion and vote.</p>
        )}

        <div className="sugg__list">
          {(items || []).map((it) => {
            const canDelete = isAdmin || it.authorId === user?.id
            return (
              <article className="sugg" key={it.id}>
                <button
                  className={`sugg__vote ${it.hasVoted ? 'sugg__vote--on' : ''}`}
                  onClick={() => vote(it.id)}
                  disabled={!user}
                  title={user ? 'Vote' : 'Log in to vote'}
                >
                  <span className="sugg__arrow">▲</span>
                  <span className="sugg__count">{it.votes}</span>
                </button>
                <div className="sugg__info">
                  <h3 className="sugg__title">
                    {it.title}
                    <span className={`sbadge sbadge--${it.status}`}>{it.status}</span>
                  </h3>
                  {it.body && <p className="sugg__body">{it.body}</p>}
                  <p className="sugg__meta">by {it.authorName || 'member'}</p>
                  {(isAdmin || canDelete) && (
                    <div className="news__admin">
                      {isAdmin && (
                        <select
                          className="sugg__status"
                          value={it.status}
                          onChange={(e) => changeStatus(it.id, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      )}
                      {canDelete && (
                        <button className="linkbtn linkbtn--danger" onClick={() => remove(it.id)}>Delete</button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        {items && items.length === 0 && <p className="empty">No suggestions yet — be the first!</p>}
      </div>
    </section>
  )
}
