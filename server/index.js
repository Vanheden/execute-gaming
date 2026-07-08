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
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { configureAuth, enabledProviders } from './auth.js'
import { listUsers, setRole } from './store.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'
// Where to send the browser back to after login (the frontend).
const FRONTEND = process.env.PUBLIC_BASE_URL || 'http://localhost:5173'

// Behind the host's HTTPS proxy in production; needed so secure cookies work.
if (isProd) app.set('trust proxy', 1)

// Persist sessions to disk so restarts/deploys don't log everyone out.
const FileStore = sessionFileStore(session)

app.use(express.json())
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

// --- Discord ---------------------------------------------------------------
if (enabledProviders.discord) {
  app.get('/auth/discord', passport.authenticate('discord'))
  app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: `${FRONTEND}/?login=failed` }),
    (req, res) => res.redirect(`${FRONTEND}/?login=success`),
  )
}

// --- Steam -----------------------------------------------------------------
if (enabledProviders.steam) {
  app.get('/auth/steam', passport.authenticate('steam'))
  app.get(
    '/auth/steam/callback',
    passport.authenticate('steam', { failureRedirect: `${FRONTEND}/?login=failed` }),
    (req, res) => res.redirect(`${FRONTEND}/?login=success`),
  )
}

// --- API -------------------------------------------------------------------
// Which providers are configured (so the UI can enable/disable buttons).
app.get('/api/config', (req, res) => res.json({ providers: enabledProviders }))

// The currently logged-in user (or null).
app.get('/api/me', (req, res) => res.json({ user: req.user || null }))

// --- Public members roster -------------------------------------------------
// Anyone can view the community roster. Only safe, non-identifying fields are
// exposed (a hashed key instead of the raw Discord/Steam id).
app.get('/api/members', (req, res) => {
  const members = listUsers().map((u) => ({
    key: createHash('sha1').update(u.id).digest('hex').slice(0, 12),
    username: u.username,
    avatar: u.avatar,
    provider: u.provider,
    role: u.role,
    discordRoles: u.discordRoles || [],
    createdAt: u.createdAt,
  }))
  res.json({ members })
})

// --- Admin API (admin-only) ------------------------------------------------
function ensureAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next()
  return res.status(403).json({ error: 'forbidden' })
}

// List all registered members.
app.get('/api/admin/users', ensureAdmin, (req, res) => {
  res.json({ users: listUsers() })
})

// Promote / demote a member.
app.post('/api/admin/users/:id/role', ensureAdmin, (req, res) => {
  const { role } = req.body || {}
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'invalid role' })
  }
  const user = setRole(req.params.id, role)
  if (!user) return res.status(404).json({ error: 'not found' })
  res.json({ user })
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

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT} (${isProd ? 'production' : 'dev'})`)
  console.log(
    `Providers — Discord: ${enabledProviders.discord ? 'on' : 'off (no .env)'} | ` +
      `Steam: ${enabledProviders.steam ? 'on' : 'off (no .env)'}`,
  )
})
