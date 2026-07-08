// ---------------------------------------------------------------------------
// Audit log — a record of admin actions (role changes, bans, grants, …)
// ---------------------------------------------------------------------------
import { db } from './db.js'

// Record an admin action. `detail` may be any JSON-serialisable value.
export function logAudit({ actor, action, targetId, targetName, detail }) {
  db.prepare(
    `INSERT INTO audit_log (at, actorId, actorName, action, targetId, targetName, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    new Date().toISOString(),
    actor?.id ?? null,
    actor?.username ?? null,
    action,
    targetId ?? null,
    targetName ?? null,
    detail == null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
  )
}

// Most recent entries first (default 100, max 500).
export function listAudit(limit = 100) {
  const n = Math.min(Math.max(Number(limit) || 100, 1), 500)
  return db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(n)
}
