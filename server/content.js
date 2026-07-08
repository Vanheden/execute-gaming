// ---------------------------------------------------------------------------
// Content stores: news, events, suggestions (+ votes)
// ---------------------------------------------------------------------------
import { db } from './db.js'

const now = () => new Date().toISOString()
const rowId = (res) => Number(res.lastInsertRowid)

// --- News ------------------------------------------------------------------
export function listNews() {
  return db.prepare('SELECT * FROM news ORDER BY createdAt DESC').all()
}

export function createNews({ title, body, authorId, authorName }) {
  const ts = now()
  const res = db
    .prepare(
      `INSERT INTO news (title, body, authorId, authorName, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(title, body, authorId ?? null, authorName ?? null, ts, ts)
  return db.prepare('SELECT * FROM news WHERE id = ?').get(rowId(res))
}

export function updateNews(id, { title, body }) {
  const res = db
    .prepare('UPDATE news SET title = ?, body = ?, updatedAt = ? WHERE id = ?')
    .run(title, body, now(), id)
  if (res.changes === 0) return null
  return db.prepare('SELECT * FROM news WHERE id = ?').get(id)
}

export function deleteNews(id) {
  return db.prepare('DELETE FROM news WHERE id = ?').run(id).changes > 0
}

// --- Events ----------------------------------------------------------------
export function listEvents() {
  // Soonest first; the frontend separates upcoming from past.
  return db.prepare('SELECT * FROM events ORDER BY startsAt ASC').all()
}

export function createEvent({ title, description, startsAt, location }) {
  const res = db
    .prepare(
      `INSERT INTO events (title, description, startsAt, location, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(title, description ?? null, startsAt, location ?? null, now())
  return db.prepare('SELECT * FROM events WHERE id = ?').get(rowId(res))
}

export function updateEvent(id, { title, description, startsAt, location }) {
  const res = db
    .prepare(
      'UPDATE events SET title = ?, description = ?, startsAt = ?, location = ? WHERE id = ?',
    )
    .run(title, description ?? null, startsAt, location ?? null, id)
  if (res.changes === 0) return null
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id)
}

export function deleteEvent(id) {
  return db.prepare('DELETE FROM events WHERE id = ?').run(id).changes > 0
}

// --- Suggestions -----------------------------------------------------------
export function listSuggestions(currentUserId = '') {
  const rows = db
    .prepare(
      `SELECT s.*,
         (SELECT COUNT(*) FROM suggestion_votes v WHERE v.suggestionId = s.id) AS votes,
         EXISTS(SELECT 1 FROM suggestion_votes v
                WHERE v.suggestionId = s.id AND v.userId = ?) AS hasVoted
       FROM suggestions s
       ORDER BY (s.status = 'open') DESC, votes DESC, s.createdAt DESC`,
    )
    .all(currentUserId)
  // SQLite returns 0/1 for the boolean-ish columns.
  return rows.map((r) => ({ ...r, votes: Number(r.votes), hasVoted: !!r.hasVoted }))
}

export function getSuggestion(id) {
  return db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id) || null
}

export function createSuggestion({ title, body, authorId, authorName }) {
  const res = db
    .prepare(
      `INSERT INTO suggestions (title, body, authorId, authorName, status, createdAt)
       VALUES (?, ?, ?, ?, 'open', ?)`,
    )
    .run(title, body ?? null, authorId, authorName ?? null, now())
  return getSuggestion(rowId(res))
}

// Returns true if the user now has a vote, false if it was removed.
export function toggleVote(suggestionId, userId) {
  const existing = db
    .prepare('SELECT 1 FROM suggestion_votes WHERE suggestionId = ? AND userId = ?')
    .get(suggestionId, userId)
  if (existing) {
    db.prepare('DELETE FROM suggestion_votes WHERE suggestionId = ? AND userId = ?').run(
      suggestionId,
      userId,
    )
    return false
  }
  db.prepare('INSERT INTO suggestion_votes (suggestionId, userId) VALUES (?, ?)').run(
    suggestionId,
    userId,
  )
  return true
}

export function setSuggestionStatus(id, status) {
  const res = db.prepare('UPDATE suggestions SET status = ? WHERE id = ?').run(status, id)
  if (res.changes === 0) return null
  return getSuggestion(id)
}

export function deleteSuggestion(id) {
  return db.prepare('DELETE FROM suggestions WHERE id = ?').run(id).changes > 0
}

// --- Settings / announcement -----------------------------------------------
// A single site-wide banner, stored as JSON under the 'announcement' key.
// Returns null when there's nothing to show.
export function getAnnouncement() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'announcement'").get()
  if (!row?.value) return null
  try {
    return JSON.parse(row.value)
  } catch {
    return null
  }
}

// Pass an empty message to clear the banner.
export function setAnnouncement({ message, level }) {
  if (!message) {
    db.prepare("DELETE FROM settings WHERE key = 'announcement'").run()
    return null
  }
  const value = { message, level: level || 'info', updatedAt: now() }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('announcement', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(JSON.stringify(value))
  return value
}
