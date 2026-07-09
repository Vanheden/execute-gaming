// ---------------------------------------------------------------------------
// Auth backend — Express + Passport (Discord & Steam OAuth)
// ---------------------------------------------------------------------------
// Run with:  npm run server     (or npm run dev:all to run it with Vite)
// Reads credentials from .env (see .env.example).
// ---------------------------------------------------------------------------
import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import sessionFileStore from 'session-file-store'
import passport from 'passport'
import { createHash, timingSafeEqual } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureAuth, enabledProviders } from './auth.js'
import {
  listUsers,
  listUsersAdmin,
  getUserById,
  getUserByProvider,
  setBan,
  setNote,
  updateProfile,
} from './store.js'
import { startPolling, getHistory } from './stats.js'
import { recordSession, getLeaderboard, LEADERBOARD_PERIODS } from './playtime.js'
import { fetchWidget } from './discord.js'
import {
  badgesForUser,
  grantAchievement,
  revokeAchievement,
  catalogWithCounts,
  GRANTABLE,
} from './achievements.js'
import { logAudit, listAudit } from './audit.js'
import { recordHit, summary as analyticsSummary } from './analytics.js'
import {
  listNews,
  createNews,
  updateNews,
  deleteNews,
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  listSuggestions,
  getSuggestion,
  createSuggestion,
  toggleVote,
  setSuggestionStatus,
  deleteSuggestion,
  getAnnouncement,
  setAnnouncement,
} from './content.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'
// Where to send the browser back to after login (the frontend). In dev we always
// use the local Vite server, so a production PUBLIC_BASE_URL in .env doesn't
// bounce you to the live domain while developing.
const FRONTEND = isProd ? process.env.PUBLIC_BASE_URL || 'http://localhost:5173' : 'http://localhost:5173'

// Behind the host's HTTPS proxy in production; needed so secure cookies work.
if (isProd) app.set('trust proxy', 1)

// Persist sessions to disk so restarts/deploys don't log everyone out.
const FileStore = sessionFileStore(session)

app.use(express.json({ limit: '64kb' }))

// --- Security headers ------------------------------------------------------
// Sensible defaults that don't need a dependency. Caddy adds HSTS + handles TLS
// in production; these cover clickjacking, MIME sniffing and referrer leakage.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  next()
})

// --- Simple in-memory rate limiter for writes ------------------------------
// Per-IP sliding window on mutating requests. Enough to blunt abuse without a
// dependency or shared store; resets on restart, which is fine for this scale.
const rateHits = new Map()
const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX = 60 // mutating requests per IP per minute
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS
  for (const [ip, hits] of rateHits) {
    const kept = hits.filter((t) => t > cutoff)
    if (kept.length) rateHits.set(ip, kept)
    else rateHits.delete(ip)
  }
}, RATE_WINDOW_MS).unref()

app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  const hits = (rateHits.get(ip) || []).filter((t) => t > now - RATE_WINDOW_MS)
  hits.push(now)
  rateHits.set(ip, hits)
  if (hits.length > RATE_MAX) return res.status(429).json({ error: 'too many requests' })
  next()
})

app.use(
  session({
    store: new FileStore({
      path: join(__dirname, 'data', 'sessions'),
      retries: 1,
      ttl: 60 * 60 * 24 * 30, // 30 days
      logFn: () => {}, // silence its verbose logging
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd, // requires HTTPS in production
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    },
  }),
)
app.use(passport.initialize())
app.use(passport.session())

configureAuth(passport)

// Shared post-login handler. Banned members are logged straight back out so a
// ban takes effect on their next login without needing to touch sessions.
function finishLogin(req, res) {
  if (req.user?.banned) {
    return req.logout(() => req.session.destroy(() => res.redirect(`${FRONTEND}/?login=banned`)))
  }
  res.redirect(`${FRONTEND}/?login=success`)
}

// --- Discord ---------------------------------------------------------------
if (enabledProviders.discord) {
  app.get('/auth/discord', passport.authenticate('discord'))
  app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: `${FRONTEND}/?login=failed` }),
    finishLogin,
  )
}

// --- Steam -----------------------------------------------------------------
if (enabledProviders.steam) {
  app.get('/auth/steam', passport.authenticate('steam'))
  app.get(
    '/auth/steam/callback',
    passport.authenticate('steam', { failureRedirect: `${FRONTEND}/?login=failed` }),
    finishLogin,
  )
}

// --- API -------------------------------------------------------------------
// Which providers are configured (so the UI can enable/disable buttons).
app.get('/api/config', (req, res) => res.json({ providers: enabledProviders }))

// The currently logged-in user (or null), decorated with earned badges.
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null })
  const rank = memberRank(req.user.id)
  res.json({ user: { ...req.user, key: keyOf(req.user.id), rank, badges: badgesForUser(req.user, rank) } })
})

// --- Announcement banner (public read, admin write) ------------------------
app.get('/api/announcement', (req, res) => res.json({ announcement: getAnnouncement() }))

app.put('/api/announcement', ensureAdmin, (req, res) => {
  const message = req.body?.message ? str(req.body.message, 280) : null
  const level = ['info', 'warning', 'critical'].includes(req.body?.level)
    ? req.body.level
    : 'info'
  const announcement = setAnnouncement({ message, level })
  logAudit({
    actor: req.user,
    action: message ? 'announcement.set' : 'announcement.clear',
    detail: message ? { level, message } : null,
  })
  res.json({ announcement })
})

// --- Analytics beacon (public, no PII) -------------------------------------
app.post('/api/hit', (req, res) => {
  recordHit(req.body?.path)
  res.status(204).end()
})

// Player-count history for a server (public). ?hours= (default 24, max 168).
app.get('/api/servers/:id/history', (req, res) => {
  const hours = Math.min(Math.max(Number(req.query.hours) || 24, 1), 168)
  res.json({ points: getHistory(req.params.id, hours) })
})

// --- Playtime leaderboard --------------------------------------------------
// Ingest: the in-game BepInEx mod POSTs a play session (see server/playtime.js).
// Not user-authenticated — guarded by a shared secret in INGEST_SECRET. Fails
// closed: if the secret isn't configured, ingest is disabled entirely.
function ensureIngestSecret(req, res, next) {
  const expected = process.env.INGEST_SECRET
  if (!expected) return res.status(503).json({ error: 'ingest disabled' })
  const got = req.get('x-ingest-secret') || ''
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  next()
}

app.post('/api/ingest/session', ensureIngestSecret, (req, res) => {
  const result = recordSession(req.body)
  if (result.error) return res.status(400).json({ error: result.error })
  res.status(204).end()
})

// Public leaderboard ranked by total playtime. ?serverId= (default all),
// ?period=all|30d|7d, ?limit= (default 100). Rows are linked to member accounts
// where the SteamID matches a Steam login, so entries can deep-link to profiles.
app.get('/api/leaderboard', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const period = LEADERBOARD_PERIODS.includes(req.query.period) ? req.query.period : 'all'
  const rows = getLeaderboard({ serverId, period, limit: req.query.limit })
  const entries = rows.map((r) => {
    const member = getUserByProvider('steam', r.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: r.steamId,
      name: linked?.username || r.charName || 'Unknown vampire',
      charName: r.charName || null,
      seconds: r.seconds,
      sessions: r.sessions,
      lastSeen: r.lastSeen,
      // Only expose account info (never the raw id) when it's a real, unbanned member.
      member: linked
        ? { key: keyOf(linked.id), avatar: linked.avatar, role: linked.role }
        : null,
    }
  })
  res.json({ entries, period, serverId })
})

// A stable, non-identifying public key for a user (never expose the raw id).
const keyOf = (id) => createHash('sha1').update(id).digest('hex').slice(0, 12)

// 1-based join position (used for the "Founding Member" badge). null if unknown.
function memberRank(id) {
  const i = listUsers().findIndex((u) => u.id === id)
  return i === -1 ? null : i + 1
}

// Public-safe serialisation of a member, including earned badges.
function publicMember(u, rank) {
  return {
    key: keyOf(u.id),
    username: u.username,
    avatar: u.avatar,
    provider: u.provider,
    role: u.role,
    discordRoles: u.discordRoles || [],
    bio: u.bio || null,
    favoriteServer: u.favoriteServer || null,
    badges: badgesForUser(u, rank),
    rank,
    createdAt: u.createdAt,
  }
}

// --- Public members roster -------------------------------------------------
// Anyone can view the community roster. Only safe, non-identifying fields are
// exposed (a hashed key instead of the raw Discord/Steam id). Banned members
// are hidden. Ranks are computed before hiding so join order stays stable.
app.get('/api/members', (req, res) => {
  const members = listUsers()
    .map((u, i) => ({ u, rank: i + 1 }))
    .filter(({ u }) => !u.banned)
    .map(({ u, rank }) => publicMember(u, rank))
  res.json({ members })
})

// A single public profile by its hashed key (for shareable /u/:key pages).
app.get('/api/profile/:key', (req, res) => {
  const all = listUsers()
  const i = all.findIndex((u) => keyOf(u.id) === req.params.key)
  if (i === -1 || all[i].banned) return res.status(404).json({ error: 'not found' })
  res.json({ member: publicMember(all[i], i + 1) })
})

// Full achievement catalog with holder counts (public).
app.get('/api/achievements', (req, res) => {
  const members = listUsers().filter((u) => !u.banned)
  res.json({ achievements: catalogWithCounts(members) })
})

// --- Live Discord widget (public) ------------------------------------------
app.get('/api/discord/widget', async (req, res) => {
  const widget = await fetchWidget(process.env.DISCORD_GUILD_ID)
  res.json({ widget })
})

// Update your own profile (bio + favourite server).
app.put('/api/me/profile', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' })
  const bio = req.body?.bio ? str(req.body.bio, 500) : null
  const favoriteServer = req.body?.favoriteServer ? str(req.body.favoriteServer, 60) : null
  const user = updateProfile(req.user.id, { bio, favoriteServer })
  if (!user) return res.status(404).json({ error: 'not found' })
  res.json({ user })
})

// --- Auth guards -----------------------------------------------------------
function ensureAuth(req, res, next) {
  if (req.user) return next()
  return res.status(401).json({ error: 'unauthorized' })
}
function ensureAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next()
  return res.status(403).json({ error: 'forbidden' })
}

// Trim + length-check a string field.
function str(v, max) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t || t.length > max) return null
  return t
}

// --- News (public read, admin write) ---------------------------------------
app.get('/api/news', (req, res) => res.json({ news: listNews() }))

app.post('/api/news', ensureAdmin, (req, res) => {
  const title = str(req.body?.title, 140)
  const body = str(req.body?.body, 8000)
  if (!title || !body) return res.status(400).json({ error: 'title and body required' })
  res.json({ post: createNews({ title, body, authorId: req.user.id, authorName: req.user.username }) })
})

app.put('/api/news/:id', ensureAdmin, (req, res) => {
  const title = str(req.body?.title, 140)
  const body = str(req.body?.body, 8000)
  if (!title || !body) return res.status(400).json({ error: 'title and body required' })
  const post = updateNews(Number(req.params.id), { title, body })
  if (!post) return res.status(404).json({ error: 'not found' })
  res.json({ post })
})

app.delete('/api/news/:id', ensureAdmin, (req, res) => {
  if (!deleteNews(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// --- Events (public read, admin write) -------------------------------------
app.get('/api/events', (req, res) => res.json({ events: listEvents() }))

app.post('/api/events', ensureAdmin, (req, res) => {
  const title = str(req.body?.title, 140)
  const startsAt = str(req.body?.startsAt, 40)
  if (!title || !startsAt) return res.status(400).json({ error: 'title and startsAt required' })
  const description = req.body?.description ? str(req.body.description, 4000) : null
  const location = req.body?.location ? str(req.body.location, 140) : null
  res.json({ event: createEvent({ title, description, startsAt, location }) })
})

app.put('/api/events/:id', ensureAdmin, (req, res) => {
  const title = str(req.body?.title, 140)
  const startsAt = str(req.body?.startsAt, 40)
  if (!title || !startsAt) return res.status(400).json({ error: 'title and startsAt required' })
  const description = req.body?.description ? str(req.body.description, 4000) : null
  const location = req.body?.location ? str(req.body.location, 140) : null
  const event = updateEvent(Number(req.params.id), { title, description, startsAt, location })
  if (!event) return res.status(404).json({ error: 'not found' })
  res.json({ event })
})

app.delete('/api/events/:id', ensureAdmin, (req, res) => {
  if (!deleteEvent(Number(req.params.id))) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

// --- Suggestions (members post + vote, admins moderate) --------------------
app.get('/api/suggestions', (req, res) => {
  res.json({ suggestions: listSuggestions(req.user?.id || '') })
})

app.post('/api/suggestions', ensureAuth, (req, res) => {
  const title = str(req.body?.title, 140)
  if (!title) return res.status(400).json({ error: 'title required' })
  const body = req.body?.body ? str(req.body.body, 2000) : null
  res.json({
    suggestion: createSuggestion({ title, body, authorId: req.user.id, authorName: req.user.username }),
  })
})

app.post('/api/suggestions/:id/vote', ensureAuth, (req, res) => {
  const id = Number(req.params.id)
  if (!getSuggestion(id)) return res.status(404).json({ error: 'not found' })
  res.json({ hasVoted: toggleVote(id, req.user.id) })
})

app.patch('/api/suggestions/:id/status', ensureAdmin, (req, res) => {
  const { status } = req.body || {}
  if (!['open', 'planned', 'done', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' })
  }
  const suggestion = setSuggestionStatus(Number(req.params.id), status)
  if (!suggestion) return res.status(404).json({ error: 'not found' })
  res.json({ suggestion })
})

// Author or admin can delete a suggestion.
app.delete('/api/suggestions/:id', ensureAuth, (req, res) => {
  const id = Number(req.params.id)
  const s = getSuggestion(id)
  if (!s) return res.status(404).json({ error: 'not found' })
  if (s.authorId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' })
  }
  deleteSuggestion(id)
  res.json({ ok: true })
})

// List all registered members (with moderation fields + badges + rank).
app.get('/api/admin/users', ensureAdmin, (req, res) => {
  const users = listUsersAdmin().map((u, i) => ({
    ...u,
    rank: i + 1,
    badges: badgesForUser(u, i + 1),
  }))
  res.json({ users })
})

// Note: admin role is env-driven (DISCORD_ADMIN_USER_IDS / DISCORD_ADMIN_ROLE_IDS)
// and recomputed on every login, so there's no manual promote/demote endpoint.

// Ban / unban a member. They're logged out on their next login attempt.
app.post('/api/admin/users/:id/ban', ensureAdmin, (req, res) => {
  const banned = !!req.body?.banned
  const reason = req.body?.reason ? str(req.body.reason, 280) : null
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: "you can't ban yourself" })
  }
  const user = setBan(req.params.id, banned, reason)
  if (!user) return res.status(404).json({ error: 'not found' })
  logAudit({
    actor: req.user,
    action: banned ? 'user.ban' : 'user.unban',
    targetId: user.id,
    targetName: user.username,
    detail: reason,
  })
  res.json({ user })
})

// Set (or clear) a private admin note on a member.
app.post('/api/admin/users/:id/note', ensureAdmin, (req, res) => {
  const note = req.body?.note ? str(req.body.note, 1000) : null
  const user = setNote(req.params.id, note)
  if (!user) return res.status(404).json({ error: 'not found' })
  logAudit({ actor: req.user, action: 'user.note', targetId: user.id, targetName: user.username })
  res.json({ ok: true })
})

// Grant an achievement badge.
app.post('/api/admin/users/:id/achievements', ensureAdmin, (req, res) => {
  const code = req.body?.code
  if (!GRANTABLE.includes(code)) return res.status(400).json({ error: 'invalid achievement' })
  const target = getUserById(req.params.id)
  if (!target) return res.status(404).json({ error: 'not found' })
  grantAchievement(target.id, code, req.user.id)
  logAudit({ actor: req.user, action: 'achievement.grant', targetId: target.id, targetName: target.username, detail: code })
  res.json({ rank: memberRank(target.id), badges: badgesForUser(target, memberRank(target.id)) })
})

// Revoke an achievement badge.
app.delete('/api/admin/users/:id/achievements/:code', ensureAdmin, (req, res) => {
  const target = getUserById(req.params.id)
  if (!target) return res.status(404).json({ error: 'not found' })
  revokeAchievement(target.id, req.params.code)
  logAudit({ actor: req.user, action: 'achievement.revoke', targetId: target.id, targetName: target.username, detail: req.params.code })
  res.json({ rank: memberRank(target.id), badges: badgesForUser(target, memberRank(target.id)) })
})

// Audit log (most recent first).
app.get('/api/admin/audit', ensureAdmin, (req, res) => {
  res.json({ entries: listAudit(req.query.limit) })
})

// Traffic analytics summary.
app.get('/api/admin/analytics', ensureAdmin, (req, res) => {
  res.json(analyticsSummary(req.query.days))
})

// Log out.
app.post('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ ok: false })
    req.session.destroy(() => res.json({ ok: true }))
  })
})

// --- Serve the built frontend (production only) ----------------------------
// In dev, Vite serves the frontend and proxies /auth + /api here instead.
// In production this one Node app serves everything on one origin, so cookies
// work and there's no CORS to configure. Run `npm run build` first.
if (isProd) {
  const DIST = join(__dirname, '..', 'dist')
  app.use(express.static(DIST))
  // SPA fallback: send index.html for any non-API route.
  app.get('*', (req, res) => res.sendFile(join(DIST, 'index.html')))
}

// Start collecting player-count history in the background.
startPolling()

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT} (${isProd ? 'production' : 'dev'})`)
  console.log(
    `Providers — Discord: ${enabledProviders.discord ? 'on' : 'off (no .env)'} | ` +
      `Steam: ${enabledProviders.steam ? 'on' : 'off (no .env)'}`,
  )
})
