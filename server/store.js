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

// Admins can be pinned by raw Discord user id via DISCORD_ADMIN_USER_IDS
// (comma-separated, e.g. "213993034075996162,987654321098765432"). This is
// the lockout-proof way to grant admin — it doesn't depend on role sync.
function adminUserIds() {
  return (process.env.DISCORD_ADMIN_USER_IDS || '')
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
    bio: row.bio ?? null,
    favoriteServer: row.favoriteServer ?? null,
    banned: !!row.banned,
    createdAt: row.createdAt,
    lastLogin: row.lastLogin,
  }
}

// Admin view — includes moderation fields (note, ban reason) that must never
// leak through the public / self endpoints.
function rowToAdminUser(row) {
  const u = rowToUser(row)
  if (!u) return null
  return { ...u, note: row.note ?? null, banReason: row.banReason ?? null }
}

export function getUserById(id) {
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
}

// Look up an account by provider + that provider's id. Resolves through the
// identity table first (so a *linked* Steam id lands on its primary account),
// then falls back to the legacy `provider:providerId` id. Used to link play
// sessions / kills (which carry a raw SteamID) back to a member.
export function getUserByProvider(provider, providerId) {
  const idn = getIdentity(provider, providerId)
  if (idn) return getUserById(idn.userId)
  return getUserById(`${provider}:${providerId}`)
}

// --- Linked identities -----------------------------------------------------
export function getIdentity(provider, providerId) {
  return (
    db
      .prepare('SELECT provider, providerId, userId FROM user_identities WHERE provider = ? AND providerId = ?')
      .get(provider, providerId) || null
  )
}

// All identities owned by an account (its own provider + any linked ones).
export function getUserIdentities(userId) {
  return db
    .prepare('SELECT provider, providerId, linkedAt FROM user_identities WHERE userId = ? ORDER BY linkedAt ASC')
    .all(userId)
}

// Make sure an account's own identity row exists (idempotent).
function ensureSelfIdentity(user) {
  if (!user) return
  db.prepare(
    'INSERT OR IGNORE INTO user_identities (provider, providerId, userId, linkedAt) VALUES (?, ?, ?, ?)',
  ).run(user.provider, user.providerId, user.id, user.createdAt || new Date().toISOString())
}

// Resolve a provider login to an account, honoring account links. If this
// identity is linked to a *different* primary account, sign in as that primary;
// otherwise create/update the standalone account as before. Used by the auth
// strategies in place of a bare upsertUser.
export function loginWithProvider(profile) {
  const selfId = `${profile.provider}:${profile.providerId}`
  const idn = getIdentity(profile.provider, profile.providerId)
  if (idn && idn.userId !== selfId) {
    db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?').run(new Date().toISOString(), idn.userId)
    return getUserById(idn.userId)
  }
  const user = upsertUser(profile)
  ensureSelfIdentity(user)
  return user
}

// Fold one account's data into another, then delete it. Keyed-by-userId data
// (achievements, suggestion authorship/votes, owned identities) moves to `toId`;
// play_sessions/kills are keyed by SteamID and re-resolve via the identity table,
// so they need no move. Runs in a transaction.
export function mergeAccounts(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return
  db.exec('BEGIN')
  try {
    db.prepare(
      'INSERT OR IGNORE INTO achievements (userId, code, grantedAt, grantedBy) SELECT ?, code, grantedAt, grantedBy FROM achievements WHERE userId = ?',
    ).run(toId, fromId)
    db.prepare('DELETE FROM achievements WHERE userId = ?').run(fromId)
    db.prepare('UPDATE suggestions SET authorId = ? WHERE authorId = ?').run(toId, fromId)
    db.prepare(
      'INSERT OR IGNORE INTO suggestion_votes (suggestionId, userId) SELECT suggestionId, ? FROM suggestion_votes WHERE userId = ?',
    ).run(toId, fromId)
    db.prepare('DELETE FROM suggestion_votes WHERE userId = ?').run(fromId)
    db.prepare('UPDATE user_identities SET userId = ? WHERE userId = ?').run(toId, fromId)
    db.prepare('DELETE FROM users WHERE id = ?').run(fromId)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

// Link a provider identity to a signed-in primary account. Merges any pre-existing
// standalone account for that identity into the primary. Returns { ok } or { error }.
export function linkProviderToUser(primaryUserId, provider, providerId) {
  const selfId = `${provider}:${providerId}`
  const primary = getUserById(primaryUserId)
  if (!primary) return { error: 'Not signed in.' }
  if (selfId === primaryUserId) return { error: 'That is already your primary account.' }

  const existing = getIdentity(provider, providerId)
  if (existing && existing.userId !== primaryUserId && existing.userId !== selfId)
    return { error: 'That account is already linked to another member.' }
  if (getUserIdentities(primaryUserId).some((i) => i.provider === provider))
    return { error: `You already have a ${provider} account linked.` }

  const standalone = getUserById(selfId)
  if (standalone) mergeAccounts(selfId, primaryUserId)

  db.prepare(
    `INSERT INTO user_identities (provider, providerId, userId, linkedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider, providerId) DO UPDATE SET userId = excluded.userId, linkedAt = excluded.linkedAt`,
  ).run(provider, providerId, primaryUserId, new Date().toISOString())
  return { ok: true }
}

// Remove a linked identity. You can't unlink the provider you sign in with.
export function unlinkProvider(primaryUserId, provider) {
  const primary = getUserById(primaryUserId)
  if (!primary) return { error: 'Not signed in.' }
  if (primary.provider === provider) return { error: "You can't unlink the account you sign in with." }
  const target = getUserIdentities(primaryUserId).find((i) => i.provider === provider)
  if (!target) return { error: `No linked ${provider} account.` }
  db.prepare('DELETE FROM user_identities WHERE provider = ? AND providerId = ? AND userId = ?').run(
    provider,
    target.providerId,
    primaryUserId,
  )
  return { ok: true }
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

  // Role is fully env-driven and recomputed on every login (no bootstrap, no
  // stored-role fallback): you're an admin iff your Discord user id is pinned in
  // DISCORD_ADMIN_USER_IDS, or you hold a role listed in DISCORD_ADMIN_ROLE_IDS.
  // Removing someone from both therefore demotes them on their next login.
  const pinnedByUserId = provider === 'discord' && adminUserIds().includes(providerId)
  const role = pinnedByUserId || adminByProvider ? 'admin' : 'member'

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

// Same order as listUsers, but with moderation fields — admin-only.
export function listUsersAdmin() {
  return db
    .prepare('SELECT * FROM users ORDER BY createdAt ASC')
    .all()
    .map(rowToAdminUser)
}

// A member editing their own profile (bio + favourite server).
export function updateProfile(id, { bio, favoriteServer }) {
  const res = db
    .prepare('UPDATE users SET bio = ?, favoriteServer = ? WHERE id = ?')
    .run(bio ?? null, favoriteServer ?? null, id)
  if (res.changes === 0) return null
  return getUserById(id)
}

// Ban / unban a member. Reason is kept for the audit trail + admin view.
export function setBan(id, banned, reason) {
  const res = db
    .prepare('UPDATE users SET banned = ?, banReason = ? WHERE id = ?')
    .run(banned ? 1 : 0, banned ? reason ?? null : null, id)
  if (res.changes === 0) return null
  return getUserById(id)
}

// A private admin note attached to a member.
export function setNote(id, note) {
  const res = db.prepare('UPDATE users SET note = ? WHERE id = ?').run(note ?? null, id)
  if (res.changes === 0) return null
  return getUserById(id)
}

export function isBanned(id) {
  const row = db.prepare('SELECT banned FROM users WHERE id = ?').get(id)
  return !!row?.banned
}

export function countUsers() {
  return db.prepare('SELECT COUNT(*) AS n FROM users').get().n
}
