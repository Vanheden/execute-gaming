// ---------------------------------------------------------------------------
// User store — SQLite (via Node's built-in node:sqlite)
// ---------------------------------------------------------------------------
// A single-file database at server/data/users.db. No native modules, no
// separate DB server. The rest of the app only uses the functions exported
// here, so the storage engine is fully swappable.
//
// On first run it auto-migrates any accounts from the old users.json.
// ---------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { db, DATA_DIR } from './db.js'

const LEGACY_JSON = join(DATA_DIR, 'users.json')

// One-time migration from the old users.json (keeps existing accounts + roles).
migrateFromJsonIfNeeded()

function migrateFromJsonIfNeeded() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
  if (count > 0 || !existsSync(LEGACY_JSON)) return
  try {
    const data = JSON.parse(readFileSync(LEGACY_JSON, 'utf8'))
    const insert = db.prepare(
      `INSERT OR IGNORE INTO users
       (id, provider, providerId, username, avatar, profileUrl, role, discordRoles, createdAt, lastLogin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const now = new Date().toISOString()
    for (const u of Object.values(data)) {
      insert.run(
        u.id,
        u.provider,
        u.providerId,
        u.username,
        u.avatar ?? null,
        u.profileUrl ?? null,
        u.role || 'member',
        JSON.stringify(u.discordRoles || []),
        u.createdAt || now,
        u.lastLogin || now,
      )
    }
    console.log(`Migrated ${Object.keys(data).length} user(s) from users.json to SQLite.`)
  } catch (err) {
    console.warn('users.json migration skipped:', err.message)
  }
}

// Admins can be pinned via the ADMIN_IDS env var (comma-separated "provider:id",
// e.g. "discord:123,steam:765..."). These always win over a stored role.
function pinnedAdminIds() {
  return (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function rowToUser(row) {
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    providerId: row.providerId,
    username: row.username,
    avatar: row.avatar ?? null,
    profileUrl: row.profileUrl ?? null,
    role: row.role,
    discordRoles: row.discordRoles ? JSON.parse(row.discordRoles) : [],
    createdAt: row.createdAt,
    lastLogin: row.lastLogin,
  }
}

export function getUserById(id) {
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

// Creates the account on first login, updates it on subsequent logins.
export function upsertUser({
  provider,
  providerId,
  username,
  avatar,
  profileUrl,
  discordRoles,
  adminByProvider,
}) {
  const id = `${provider}:${providerId}`
  const now = new Date().toISOString()
  const existing = getUserById(id)

  // Role resolution: pinned admins / synced Discord admin role > existing role
  // > bootstrap > member. Bootstrap: if nobody is an admin yet, the next person
  // to log in becomes one, so the community can never end up with zero admins.
  const noAdminsYet = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n === 0
  const role =
    pinnedAdminIds().includes(id) || adminByProvider
      ? 'admin'
      : existing?.role || (noAdminsYet ? 'admin' : 'member')

  // Keep prior roles if this login didn't fetch them (e.g. a Steam login).
  const roles = discordRoles !== undefined ? discordRoles : existing?.discordRoles || []
  const createdAt = existing?.createdAt || now

  db.prepare(
    `INSERT INTO users
       (id, provider, providerId, username, avatar, profileUrl, role, discordRoles, createdAt, lastLogin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       username     = excluded.username,
       avatar       = excluded.avatar,
       profileUrl   = excluded.profileUrl,
       role         = excluded.role,
       discordRoles = excluded.discordRoles,
       lastLogin    = excluded.lastLogin`,
  ).run(
    id,
    provider,
    providerId,
    username,
    avatar ?? null,
    profileUrl ?? null,
    role,
    JSON.stringify(roles),
    createdAt,
    now,
  )

  return getUserById(id)
}

export function listUsers() {
  return db
    .prepare('SELECT * FROM users ORDER BY createdAt ASC')
    .all()
    .map(rowToUser)
}

export function setRole(id, role) {
  const res = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
  if (res.changes === 0) return null
  return getUserById(id)
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n
}
