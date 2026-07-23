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
  getUserIdentities,
  linkProviderToUser,
  unlinkProvider,
  setBan,
  setNote,
  updateProfile,
} from './store.js'
import { startPolling, getHistory, getLiveStatus, bmHeaders } from './stats.js'
import {
  recordSession,
  recordKill,
  getLeaderboard,
  allTimePoints,
  topServers,
  serverPlaytime,
  getPlayerStats,
  getPlayerRecap,
  getPvpLeaderboard,
  getPvpRating,
  getServerRecords,
  getTopRampages,
  rampageTier,
  getPlayerTotals,
  getPlayerTotalsBatch,
  getRecentKills,
  getVBloodHuntProgress,
  getPlayerActivity,
  getWeeklyHighlights,
  getGlobalStats,
  getHottestFeud,
  getRivalries,
  getPlayerStreak,
  getTopStreaks,
  checkRankPromotion,
  checkMilestones,
  searchPlayers,
  getLeaderboardResets,
  getLeaderboardResetsAdmin,
  setLeaderboardReset,
  restoreLeaderboardReset,
  getSeasonChampions,
  getClanLeaderboard,
  getClanStats,
  getClanWars,
  getHottestClanWar,
  recordRaid,
  getRaidFeed,
  getClanRaidRecord,
  getTopRaiderClan,
  LEADERBOARD_PERIODS,
  LEADERBOARD_METRICS,
} from './playtime.js'
import {
  fetchWidget,
  announceNews,
  announceEvent,
  announceAnnouncement,
  announceRankUp,
  announceSuggestion,
  announceSeason,
  announceMilestone,
  announceTest,
} from './discord.js'
import { vbloodName, VBLOOD_BOSSES, bossNamesForGuids } from '../src/data/vbloods.js'
import { rankForPoints } from '../src/data/ranks.js'
import { servers } from '../src/data/servers.js'
import { checkAndRecordCompletions, getChallengeState, challengePoints } from './challenges.js'
import {
  badgesForUser,
  grantAchievement,
  revokeAchievement,
  catalogWithCounts,
  GRANTABLE,
} from './achievements.js'
import { turnstileEnabled, turnstileSiteKey, verifyTurnstile } from './turnstile.js'
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
  isKillFeedEnabled,
  setKillFeedEnabled,
  getFeatureFlags,
  setFeatureEnabled,
  FEATURE_KEYS,
  getWebhookFlags,
  setWebhookEnabled,
  isWebhookEnabled,
  WEBHOOK_KEYS,
} from './content.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

// --- Fail fast on insecure production config -------------------------------
// A default/missing SESSION_SECRET means anyone can forge a session cookie and
// impersonate any account (including an admin), so refuse to boot with it in
// production. INGEST_SECRET being unset is safe (ingest fails closed / stays
// disabled), so that's only a warning. Dev keeps running with the fallbacks.
if (isProd) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret-change-me') {
    console.error(
      '[boot] Refusing to start: SESSION_SECRET is unset or still the default.\n' +
        '       Set a long random string in .env — otherwise session cookies are forgeable.',
    )
    process.exit(1)
  }
  if (!process.env.INGEST_SECRET) {
    console.warn('[boot] INGEST_SECRET is unset — leaderboard ingest is disabled (endpoints return 503).')
  }
}

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

// Post-OAuth handler for the *link* flow. The primary account is still in the
// session (we authenticated with assignProperty so it wasn't replaced); the
// freshly-authenticated identity is on req.account. Link it, then redirect.
function finishLink(provider) {
  return (req, res) => {
    const linking = req.session?.linking
    if (req.session) delete req.session.linking
    const acct = req.account
    if (!linking || linking.userId !== req.user?.id || !acct) {
      return res.redirect(`${FRONTEND}/?linkerror=${encodeURIComponent('Linking session expired — try again.')}`)
    }
    const result = linkProviderToUser(req.user.id, provider, acct.providerId)
    if (result.error) return res.redirect(`${FRONTEND}/?linkerror=${encodeURIComponent(result.error)}`)
    logAudit({ actor: req.user, action: 'account.link', detail: { provider, providerId: acct.providerId } })
    res.redirect(`${FRONTEND}/?linked=${provider}`)
  }
}

// One callback per provider that branches: if the session is mid-link (and it's
// this provider), attach the identity to the current account without replacing
// the session user; otherwise it's a normal login.
function providerCallback(provider) {
  return (req, res, next) => {
    if (req.session?.linking?.provider === provider && req.user) {
      return passport.authenticate(provider, {
        assignProperty: 'account',
        failureRedirect: `${FRONTEND}/?linkerror=${encodeURIComponent('Could not verify that account.')}`,
      })(req, res, () => finishLink(provider)(req, res))
    }
    return passport.authenticate(provider, { failureRedirect: `${FRONTEND}/?login=failed` })(
      req,
      res,
      () => finishLogin(req, res),
    )
  }
}

// Start a link: must be signed in. Stash intent in the session, then OAuth.
function startLink(provider) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(`${FRONTEND}/?login=required`)
    req.session.linking = { provider, userId: req.user.id }
    passport.authenticate(provider)(req, res, next)
  }
}

// --- Discord ---------------------------------------------------------------
if (enabledProviders.discord) {
  app.get('/auth/discord', ensureLoginCaptcha, passport.authenticate('discord'))
  app.get('/auth/discord/link', startLink('discord'))
  app.get('/auth/discord/callback', providerCallback('discord'))
}

// --- Steam -----------------------------------------------------------------
if (enabledProviders.steam) {
  app.get('/auth/steam', ensureLoginCaptcha, passport.authenticate('steam'))
  app.get('/auth/steam/link', startLink('steam'))
  app.get('/auth/steam/callback', providerCallback('steam'))
}

// --- API -------------------------------------------------------------------
// Which providers are configured (so the UI can enable/disable buttons), plus the
// public Turnstile site key when CAPTCHA is enabled (safe to expose; the secret
// key never leaves the server).
app.get('/api/config', (req, res) =>
  res.json({
    providers: enabledProviders,
    turnstile: { enabled: turnstileEnabled(), siteKey: turnstileSiteKey() },
  }),
)

// CAPTCHA gate for the primary login redirects. The frontend appends ?ts=<token>
// from the Turnstile widget; verify it before starting the OAuth round-trip. No-op
// when Turnstile isn't configured. The account *link* flow is not gated — that user
// is already authenticated.
async function ensureLoginCaptcha(req, res, next) {
  if (!turnstileEnabled()) return next()
  const ok = await verifyTurnstile(req.query.ts, req.ip)
  if (!ok) return res.redirect(`${FRONTEND}/?login=captcha`)
  next()
}

// The currently logged-in user (or null), decorated with earned badges and the
// list of linked provider identities (so the profile can show link status).
app.get('/api/me', (req, res) => {
  if (!req.user) return res.json({ user: null })
  const rank = memberRank(req.user.id)
  const identities = getUserIdentities(req.user.id).map((i) => ({
    provider: i.provider,
    providerId: i.providerId,
  }))
  // Fetch game stats for auto-achievement badges (if the user has a Steam link).
  const steamIdentity = getUserIdentities(req.user.id).find((i) => i.provider === 'steam')
  const gameStats = steamIdentity ? getPlayerTotals(steamIdentity.providerId) : null
  res.json({
    user: { ...req.user, key: keyOf(req.user.id), rank, identities, badges: badgesForUser(req.user, rank, gameStats) },
  })
})

// Unlink a connected account (can't unlink the provider you sign in with).
app.post('/api/me/unlink', ensureAuth, (req, res) => {
  const provider = req.body?.provider
  if (provider !== 'discord' && provider !== 'steam') return res.status(400).json({ error: 'invalid provider' })
  const result = unlinkProvider(req.user.id, provider)
  if (result.error) return res.status(400).json({ error: result.error })
  logAudit({ actor: req.user, action: 'account.unlink', detail: { provider } })
  res.json({ ok: true })
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
  // Broadcast a freshly set banner to Discord (skip clears). Fire-and-forget.
  if (announcement && isWebhookEnabled('announcement')) announceAnnouncement(announcement)
})

// --- Kill feed toggle (public read, admin write) ---------------------------
app.get('/api/killfeed/enabled', (req, res) => res.json({ enabled: isKillFeedEnabled() }))

app.put('/api/killfeed/enabled', ensureAdmin, (req, res) => {
  const enabled = !!req.body?.enabled
  setKillFeedEnabled(enabled)
  logAudit({ actor: req.user, action: 'killfeed.toggle', detail: { enabled } })
  res.json({ enabled })
})

// --- Leaderboard panel toggles (public read, admin write) ------------------
// Milestones / weekly-highlights / season-champions visibility. Default ON.
app.get('/api/features', (req, res) => res.json(getFeatureFlags()))

app.put('/api/features', ensureAdmin, (req, res) => {
  const feature = String(req.body?.feature || '')
  if (!FEATURE_KEYS.includes(feature)) return res.status(400).json({ error: 'unknown feature' })
  const enabled = req.body?.enabled === true
  const features = setFeatureEnabled(feature, enabled)
  logAudit({ actor: req.user, action: 'feature.toggle', detail: { feature, enabled } })
  res.json({ features })
})

// --- Discord webhook admin (status, per-category toggles, test) ------------
// The whole webhook is gated by the DISCORD_WEBHOOK_URL env var; `configured`
// tells the admin panel whether it's set. Category toggles let an admin mute a
// single kind of post even when the URL is present.
app.get('/api/webhook', ensureAdmin, (req, res) => {
  res.json({ configured: !!process.env.DISCORD_WEBHOOK_URL, flags: getWebhookFlags() })
})

app.put('/api/webhook', ensureAdmin, (req, res) => {
  const key = String(req.body?.key || '')
  if (!WEBHOOK_KEYS.includes(key)) return res.status(400).json({ error: 'unknown category' })
  const enabled = req.body?.enabled === true
  const flags = setWebhookEnabled(key, enabled)
  logAudit({ actor: req.user, action: 'webhook.toggle', detail: { key, enabled } })
  res.json({ flags })
})

// Fire a test post so an admin can confirm the channel + avatar without waiting
// for real content. Returns whether Discord accepted it.
app.post('/api/webhook/test', ensureAdmin, async (req, res) => {
  if (!process.env.DISCORD_WEBHOOK_URL) {
    return res.status(400).json({ error: 'No webhook URL configured (set DISCORD_WEBHOOK_URL).' })
  }
  const ok = await announceTest({ by: req.user.username })
  logAudit({ actor: req.user, action: 'webhook.test', detail: { ok } })
  res.json({ ok })
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

// Live status for a server (public), proxied server-side from BattleMetrics so a
// visitor's VPN/adblock/CORS can't blank the card. 30s server-side cache.
app.get('/api/servers/:id/status', async (req, res) => {
  const status = await getLiveStatus(req.params.id)
  if (!status) return res.status(404).json({ error: 'unknown server' })
  res.json({ status })
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

// After a session/kill lands, post any Discord-worthy consequences: a player
// crossing into a new rank tier, and the community crossing a cumulative
// milestone. Fire-and-forget and fully guarded — ingest must never fail because
// of a webhook. `steamId` is already validated by recordSession/recordKill.
function afterIngest(steamId, charName) {
  try {
    const promo = checkRankPromotion(steamId)
    if (promo && isWebhookEnabled('rankup')) {
      const member = getUserByProvider('steam', steamId)
      const linked = member && !member.banned ? member : null
      const name = linked?.username || (charName ? String(charName).slice(0, 60) : null) || 'A vampire'
      const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
      const profileUrl = linked ? `${base}/u/${keyOf(linked.id)}` : `${base}/p/${steamId}`
      announceRankUp({ name, tier: promo.tier, points: promo.points, profileUrl })
    }
    if (isWebhookEnabled('milestone')) {
      for (const m of checkMilestones()) announceMilestone(m)
    } else {
      checkMilestones() // keep the high-water mark current even while muted
    }
  } catch (err) {
    console.warn('[ingest] post-effects failed:', err?.message || err)
  }
}

app.post('/api/ingest/session', ensureIngestSecret, (req, res) => {
  const result = recordSession(req.body)
  if (result.error) return res.status(400).json({ error: result.error })
  res.status(204).end()
  afterIngest(req.body?.steamId, req.body?.charName)
})

// Turn a kill's structured highlights into ready-to-broadcast in-game strings.
// The mod prints each one to global chat verbatim, so all boss-name resolution and
// wording lives here. Returns [] when the kill isn't noteworthy.
function buildKillBroadcasts(highlights, body) {
  if (!highlights) return []
  const out = []
  const who = body?.charName ? String(body.charName).slice(0, 60) : 'A vampire'

  // Colours are TextMeshPro <color> tags — V Rising's chat renders these but not
  // emoji (they show as missing-glyph boxes), so the flair is carried by colour.
  const c = (hex, s) => `<color=${hex}>${s}</color>`
  if (highlights.kind === 'vblood' && highlights.worldFirst) {
    const boss = vbloodName(highlights.victim) || 'a V Blood'
    out.push(`${c('#e63950', 'WORLD FIRST')} — ${c('#ffd24a', who)} was first to fell ${c('#ff8a3d', boss)}!`)
  }
  if (highlights.kind === 'pvp') {
    if (highlights.milestone) {
      const t = rampageTier(highlights.streak)
      out.push(`${c(t.color, who)} — ${c(t.color, `${t.label}!`)} (${highlights.streak} kills)`)
    }
    if (highlights.endedName && highlights.endedStreak >= RAMPAGE_TIERS_MIN) {
      out.push(
        `${c('#ff4d63', who)} ended ${c('#c3aeb9', `${highlights.endedName}'s`)} rampage (${highlights.endedStreak} kills).`,
      )
    }
  }
  return out
}
// A rampage only counts as "ended" (worth announcing) once the victim had reached
// the first tier — matches RAMPAGE_TIERS[0].at in playtime.js.
const RAMPAGE_TIERS_MIN = 3

// Ingest a single kill event (V Blood boss or PvP) from the mod. Same guard.
// Responds 200 with any in-game broadcast strings the kill earned (world-first,
// killstreak milestone, streak-ended) so the mod can announce them; the array is
// usually empty.
app.post('/api/ingest/kill', ensureIngestSecret, (req, res) => {
  const result = recordKill(req.body)
  if (result.error) return res.status(400).json({ error: result.error })
  const broadcasts = buildKillBroadcasts(result.highlights, req.body)
  // A kill can also complete a daily/weekly challenge — announce it in the same
  // broadcast channel. Best-effort: a failure here must never drop the kill.
  try {
    const who = req.body?.charName ? String(req.body.charName).slice(0, 60) : 'A vampire'
    for (const ch of checkAndRecordCompletions(req.body?.steamId, req.body?.serverId, req.body?.charName)) {
      broadcasts.push(
        `<color=#ffd24a>CHALLENGE</color> — <color=#7cf267>${who}</color> cleared "${ch.title}"! +${ch.bonus} CP`,
      )
    }
  } catch {
    /* ignore challenge errors */
  }
  res.status(200).json({ ok: true, broadcasts })
  afterIngest(req.body?.steamId, req.body?.charName)
})

// Active daily/weekly challenges + who's cleared them + Challenge Points champions.
app.get('/api/challenges', (req, res) => {
  try {
    const state = getChallengeState()
    const resolve = (c) => ({
      ...c,
      clears: c.clears.map((x) => {
        const member = getUserByProvider('steam', x.steamId)
        const linked = member && !member.banned ? member : null
        return {
          steamId: x.steamId,
          name: linked?.username || x.charName || 'Unknown vampire',
          at: x.at,
          member: linked ? { key: keyOf(linked.id) } : null,
        }
      }),
    })
    const champions = state.champions.map((c) => {
      const member = getUserByProvider('steam', c.steamId)
      const linked = member && !member.banned ? member : null
      return {
        steamId: c.steamId,
        name: linked?.username || c.charName || 'Unknown vampire',
        points: c.points,
        clears: c.clears,
        member: linked ? { key: keyOf(linked.id) } : null,
      }
    })
    res.json({ daily: resolve(state.daily), weekly: resolve(state.weekly), champions })
  } catch {
    res.json({ daily: null, weekly: null, champions: [] })
  }
})

// Ingest a single castle raid event from the mod. Same guard. No rank/milestone
// post-effects (raids aren't part of the points ladder — they're their own feed).
app.post('/api/ingest/raid', ensureIngestSecret, (req, res) => {
  const result = recordRaid(req.body)
  if (result.error) return res.status(400).json({ error: result.error })
  res.status(204).end()
})

// Public leaderboard. ?metric=points|playtime|vblood|pvp (default points),
// ?serverId= (default all), ?period=all|30d|7d, ?limit= (default 100). Every row
// carries all metrics (seconds/vblood/pvp/points) so the client can show a
// breakdown; only the ranked metric decides order. Rows are linked to member
// accounts where the SteamID matches a Steam login, to deep-link to profiles.
app.get('/api/leaderboard', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const period = LEADERBOARD_PERIODS.includes(req.query.period) ? req.query.period : 'all'
  const metric = LEADERBOARD_METRICS.includes(req.query.metric) ? req.query.metric : 'points'
  const rows = getLeaderboard({ serverId, period, metric, limit: req.query.limit })
  // Rank is all-time (independent of the *period* filter) but follows the *server*
  // filter: "All servers" → global rank, a specific server → that server's rank.
  // Resolve each row's lifetime points in one batch and attach it for the rank badge.
  const lifetime = allTimePoints(rows.map((r) => r.steamId), serverId)
  // In the "All servers" view, resolve each player's home server (where they've
  // logged the most time in-window). Skipped when a single server is selected —
  // there the home server is trivially that one.
  const homes = serverId ? {} : topServers(rows.map((r) => r.steamId), period)
  const entries = rows.map((r) => {
    const member = getUserByProvider('steam', r.steamId)
    const linked = member && !member.banned ? member : null
    // Latest V Blood boss killed, for the "Latest Kill" line. Resolve the PrefabGUID
    // to a known name; unknown ids pass through raw (the client shows a neutral label).
    const latestVBlood = r.lastVBlood
      ? { id: r.lastVBlood, name: vbloodName(r.lastVBlood), at: r.lastVBloodAt || null }
      : null
    return {
      steamId: r.steamId,
      name: linked?.username || r.charName || 'Unknown vampire',
      charName: r.charName || null,
      seconds: r.seconds,
      sessions: r.sessions,
      vblood: r.vblood,
      pvp: r.pvp,
      points: r.points,
      allTimePoints: lifetime[r.steamId] ?? r.points,
      // Home server (all-servers view only): { id, share } — the server this player
      // has spent the most time on, plus that server's % of their total playtime.
      homeServer: homes[r.steamId]?.serverId
        ? {
            id: homes[r.steamId].serverId,
            share: homes[r.steamId].total
              ? Math.round((homes[r.steamId].seconds / homes[r.steamId].total) * 100)
              : 100,
          }
        : null,
      latestVBlood,
      lastSeen: r.lastSeen,
      // Only expose account info (never the raw id) when it's a real, unbanned member.
      member: linked
        ? { key: keyOf(linked.id), avatar: linked.avatar, role: linked.role }
        : null,
    }
  })
  res.json({ entries, period, serverId, metric })
})

// Public kill feed — recent V Blood + PvP kills across all servers (or one).
// Used by the live kill feed widget on the leaderboard page.
app.get('/api/kills/recent', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const limit = req.query.limit ? Number(req.query.limit) : 20
  const kind = req.query.kind ? String(req.query.kind) : null
  const kills = getRecentKills(serverId, limit, kind)
  const entries = kills.map((k) => {
    const member = getUserByProvider('steam', k.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: k.steamId,
      charName: k.charName || linked?.username || 'Unknown vampire',
      kind: k.kind,
      victim: k.kind === 'vblood' ? vbloodName(k.victim) : k.victim,
      victimGuid: k.victim,
      occurredAt: k.occurredAt,
      serverId: k.serverId,
      member: linked ? { key: keyOf(linked.id) } : null,
    }
  })
  res.json({ kills: entries })
})

// Clan leaderboard — one row per clan (keyed by stable ClanGuid, shown under its
// latest name). Same metric/period/server filters as the player leaderboard.
app.get('/api/clans', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const period = LEADERBOARD_PERIODS.includes(req.query.period) ? req.query.period : 'all'
  const metric = LEADERBOARD_METRICS.includes(req.query.metric) ? req.query.metric : 'points'
  const rows = getClanLeaderboard({ serverId, period, metric, limit: req.query.limit })
  const entries = rows.map((c) => ({
    clanGuid: c.clanGuid,
    clanName: c.clanName || 'Unnamed clan',
    serverId: c.serverId,
    members: c.members,
    seconds: c.seconds,
    vblood: c.vblood,
    pvp: c.pvp,
    points: c.points,
  }))
  res.json({ entries, period, serverId, metric })
})

// One clan's profile: totals, roster (each member linked to their site account
// where a matching Steam login exists) and its clan-vs-clan war record.
app.get('/api/clan/:clanGuid', (req, res) => {
  const stats = getClanStats(req.params.clanGuid)
  if (!stats) return res.status(404).json({ error: 'clan not found' })
  const roster = stats.roster.map((m) => {
    const member = getUserByProvider('steam', m.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: m.steamId,
      charName: m.charName || linked?.username || 'Unknown vampire',
      seconds: m.seconds,
      vblood: m.vblood,
      pvp: m.pvp,
      member: linked ? { key: keyOf(linked.id) } : null,
    }
  })
  const wars = getClanWars(req.params.clanGuid).map((w) => ({
    clanGuid: w.rival,
    clanName: w.clanName || 'Unnamed clan',
    kills: w.kills,
    deaths: w.deaths,
  }))
  const rr = getClanRaidRecord(req.params.clanGuid)
  const raidRecord = {
    raidsDone: rr.raidsDone,
    raidsSuffered: rr.raidsSuffered,
    rivals: rr.rivals.map((r) => ({
      clanGuid: r.clanGuid,
      clanName: r.clanName || 'Unnamed clan',
      raided: r.raided,
      raidedBy: r.raidedBy,
    })),
  }
  res.json({ ...stats, roster, wars, raidRecord })
})

// Recent castle raids across all servers (or one) — the raid feed on /clans. Each
// side is resolved to a clan (linked to /c/:guid) and/or a player (linked to a
// profile) where identifiable.
app.get('/api/raids', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const limit = req.query.limit ? Number(req.query.limit) : 20
  // Resolve one side of a raid into a display object: clan (if any) + player link.
  const side = (steamId, name, clanGuid, clanName) => {
    const member = steamId ? getUserByProvider('steam', steamId) : null
    const linked = member && !member.banned ? member : null
    return {
      clanGuid: clanGuid || null,
      clanName: clanGuid ? clanName || 'Unnamed clan' : null,
      steamId: steamId || null,
      name: name || linked?.username || null,
      member: linked ? { key: keyOf(linked.id) } : null,
    }
  }
  const raids = getRaidFeed(serverId, limit).map((r) => ({
    eventId: r.eventId,
    serverId: r.serverId,
    occurredAt: r.occurredAt,
    attacker: side(r.attackerSteamId, r.attackerName, r.attackerClanGuid, r.attackerClanName),
    defender: side(r.defenderSteamId, r.defenderName, r.defenderClanGuid, r.defenderClanName),
  }))
  res.json({ raids })
})

// V Blood hunt tracker — which bosses each player has killed (for the hunt page).
app.get('/api/vblood-hunt', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const progress = getVBloodHuntProgress(serverId)
  const players = Object.entries(progress).map(([steamId, data]) => {
    const member = getUserByProvider('steam', steamId)
    const linked = member && !member.banned ? member : null
    // Collapse Primal + normal variants of the same boss to one name so a Brutal
    // server's Primal kills count once and against the 64-boss denominator.
    const bosses = bossNamesForGuids(data.bosses)
    return {
      steamId,
      charName: data.charName || linked?.username || 'Unknown vampire',
      bosses: [...bosses],
      count: bosses.size,
      member: linked ? { key: keyOf(linked.id) } : null,
    }
  })
  players.sort((a, b) => b.count - a.count)
  res.json({ players, totalBosses: VBLOOD_BOSSES.length })
})

// Season champions — top-1 player for each completed season per server.
app.get('/api/season-champions', (req, res) => {
  const results = {}
  for (const s of servers) {
    const champions = getSeasonChampions(s.id)
    results[s.id] = champions.map((c) => {
      const member = getUserByProvider('steam', c.steamId)
      const linked = member && !member.banned ? member : null
      return {
        seasonStart: c.seasonStart,
        seasonEnd: c.seasonEnd,
        steamId: c.steamId,
        charName: c.charName || linked?.username || 'Unknown vampire',
        points: c.points,
        member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
      }
    })
  }
  res.json({ champions: results })
})

// Weekly highlights — top player in each category for the last 7 days.
app.get('/api/weekly-highlights', (req, res) => {
  const h = getWeeklyHighlights()
  const resolve = (entry) => {
    if (!entry) return null
    const member = getUserByProvider('steam', entry.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: entry.steamId,
      charName: entry.charName || linked?.username || 'Unknown vampire',
      value: entry.value,
      member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
    }
  }
  res.json({
    highlights: {
      topPlaytime: resolve(h.topPlaytime),
      topVBlood: resolve(h.topVBlood),
      topPvp: resolve(h.topPvp),
      topPoints: resolve(h.topPoints),
    },
  })
})

// Community milestones + hottest PvP feud + top play streaks for the leaderboard.
app.get('/api/global-stats', (req, res) => {
  const linkFor = (steamId) => {
    if (!steamId) return null
    const m = getUserByProvider('steam', steamId)
    return m && !m.banned ? { key: keyOf(m.id), username: m.username } : null
  }

  const feud = getHottestFeud()
  const hottestFeud = feud
    ? {
        killer: { ...feud.killer, member: linkFor(feud.killer.steamId) },
        victim: { ...feud.victim, member: linkFor(feud.victim.steamId) },
        kills: feud.kills,
      }
    : null

  const topStreaks = getTopStreaks(5).map((s) => {
    const member = linkFor(s.steamId)
    return {
      steamId: s.steamId,
      charName: member?.username || s.charName || 'Unknown vampire',
      current: s.current,
      longest: s.longest,
      member,
    }
  })

  const cw = getHottestClanWar()
  const hottestClanWar = cw
    ? { a: { ...cw.a, clanName: cw.a.clanName || 'Unnamed clan' },
        b: { ...cw.b, clanName: cw.b.clanName || 'Unnamed clan' } }
    : null

  const tr = getTopRaiderClan()
  const topRaiders = tr ? { ...tr, clanName: tr.clanName || 'Unnamed clan' } : null

  res.json({ stats: getGlobalStats(), hottestFeud, hottestClanWar, topRaiders, topStreaks })
})

// Rivalries (nemeses + prey) and play streak for a player — used on both profile
// types. Keyed by SteamID so registered members and guests share the same view.
app.get('/api/player/:steamId/rivalries', (req, res) => {
  const { nemeses, prey } = getRivalries(req.params.steamId)
  const streak = getPlayerStreak(req.params.steamId)
  const resolve = (list) =>
    list.map((e) => {
      const m = e.steamId ? getUserByProvider('steam', e.steamId) : null
      const linked = m && !m.banned ? m : null
      const out = {
        steamId: e.steamId,
        charName: linked?.username || e.charName || 'Unknown vampire',
        kills: e.kills,
        member: linked ? { key: keyOf(linked.id) } : null,
      }
      if (e.revenge != null) out.revenge = e.revenge
      return out
    })
  res.json({ nemeses: resolve(nemeses), prey: resolve(prey), streak })
})

// Global player search — search all tracked players (registered + guests) by name.
app.get('/api/players/search', (req, res) => {
  const q = String(req.query.q || '')
  if (q.length < 2) return res.json({ players: [] })
  const results = searchPlayers(q, 20).map((r) => {
    const member = getUserByProvider('steam', r.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: r.steamId,
      charName: r.charName || linked?.username || 'Unknown vampire',
      seconds: r.seconds,
      vblood: r.vblood,
      pvp: r.pvp,
      points: r.points,
      lastSeen: r.lastSeen === '0' ? null : r.lastSeen,
      member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
    }
  })
  res.json({ players: results })
})

// A stable, non-identifying public key for a user (never expose the raw id).
const keyOf = (id) => createHash('sha1').update(id).digest('hex').slice(0, 12)

// 1-based join position (used for the "Founding Member" badge). null if unknown.
function memberRank(id) {
  const i = listUsers().findIndex((u) => u.id === id)
  return i === -1 ? null : i + 1
}

// Public-safe serialisation of a member, including earned badges.
// `gameStats` is optional { seconds, vblood, pvp, points } for stat-based badges.
function publicMember(u, rank, gameStats) {
  return {
    key: keyOf(u.id),
    username: u.username,
    avatar: u.avatar,
    provider: u.provider,
    role: u.role,
    discordRoles: u.discordRoles || [],
    bio: u.bio || null,
    favoriteServer: u.favoriteServer || null,
    badges: badgesForUser(u, rank, gameStats),
    rank,
    createdAt: u.createdAt,
  }
}

// --- Public members roster -------------------------------------------------
// Anyone can view the community roster. Only safe, non-identifying fields are
// exposed (a hashed key instead of the raw Discord/Steam id). Banned members
// are hidden. Ranks are computed before hiding so join order stays stable.
app.get('/api/members', (req, res) => {
  const all = listUsers()
  const indexed = all.map((u, i) => ({ u, rank: i + 1 })).filter(({ u }) => !u.banned)
  // Batch-fetch game stats for all members with Steam links (for auto badges).
  const steamIdMap = {}
  for (const { u } of indexed) {
    const sid = getUserIdentities(u.id).find((id) => id.provider === 'steam')?.providerId
    if (sid) steamIdMap[u.id] = sid
  }
  const steamIds = Object.values(steamIdMap)
  const totals = steamIds.length ? getPlayerTotalsBatch(steamIds) : {}
  const members = indexed.map(({ u, rank }) =>
    publicMember(u, rank, totals[steamIdMap[u.id]] || null),
  )
  res.json({ members })
})

// All-time leaderboard points for an account, summed across its Steam identities
// (an account can link more than one). Used for the rank badge on profiles. Returns
// { overall, perServer: [{ serverId, name, accent, points }] } — the global rank plus
// a per-server breakdown — or null if the account has no linked Steam identity.
function pointsForUser(userId) {
  const steamIds = getUserIdentities(userId)
    .filter((idn) => idn.provider === 'steam')
    .map((idn) => idn.providerId)
  if (!steamIds.length) return null
  const sum = (map) => steamIds.reduce((acc, id) => acc + (map[id] || 0), 0)
  const overall = sum(allTimePoints(steamIds))
  const playtime = serverPlaytime(steamIds) // { serverId: seconds }
  const perServer = servers.map((s) => ({
    serverId: s.id,
    name: s.name,
    accent: s.accent,
    points: sum(allTimePoints(steamIds, s.id)),
    seconds: playtime[s.id] || 0,
  }))
  return { overall, perServer }
}

// A single public profile by its hashed key (for shareable /u/:key pages).
app.get('/api/profile/:key', (req, res) => {
  const all = listUsers()
  const i = all.findIndex((u) => keyOf(u.id) === req.params.key)
  if (i === -1 || all[i].banned) return res.status(404).json({ error: 'not found' })
  const steamIdentity = getUserIdentities(all[i].id).find((id) => id.provider === 'steam')
  const gameStats = steamIdentity ? getPlayerTotals(steamIdentity.providerId) : null
  const member = publicMember(all[i], i + 1, gameStats)
  member.points = pointsForUser(all[i].id) // null if the member has no Steam link
  member.steamId = steamIdentity?.providerId || null
  res.json({ member })
})

// Public game stats for any player by SteamID (for /p/:steamId pages). Works for
// unregistered players too — shows playtime, kills, points, rank, per-server
// breakdown. If the SteamID belongs to a registered member, includes a link key.
app.get('/api/player/:steamId', (req, res) => {
  const stats = getPlayerStats(req.params.steamId)
  if (!stats) return res.status(404).json({ error: 'not found' })
  const member = getUserByProvider('steam', stats.steamId)
  const linked = member && !member.banned ? member : null
  const perServer = stats.perServer.map((s) => {
    const srv = servers.find((sv) => sv.id === s.serverId)
    return { ...s, name: srv?.name || s.serverId, accent: srv?.accent }
  })
  const latestVBlood = stats.latestVBlood
    ? { id: stats.latestVBlood.id, name: vbloodName(stats.latestVBlood.id), at: stats.latestVBlood.at }
    : null
  const toughestVBlood = stats.toughestVBlood
    ? { ...stats.toughestVBlood, name: vbloodName(stats.toughestVBlood.id) }
    : null
  const challenge = challengePoints(stats.steamId)
  res.json({
    player: {
      challenge,
      steamId: stats.steamId,
      charName: stats.charName,
      seconds: stats.seconds,
      sessions: stats.sessions,
      vblood: stats.vblood,
      pvp: stats.pvp,
      points: stats.points,
      lastSeen: stats.lastSeen,
      latestVBlood,
      toughestVBlood,
      perServer,
      pvpRating: getPvpRating(stats.steamId),
      member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
    },
  })
})

// PvP skill-rating ladder (Elo). ?limit= (default 50, max 200).
app.get('/api/pvp/leaderboard', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50
  res.json({ players: getPvpLeaderboard(limit) })
})

// Biggest PvP killstreaks this season (the rampage board on /pvp). Each row links
// to a player profile when their SteamID matches a Steam login.
app.get('/api/pvp/rampages', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10
  const rows = getTopRampages(limit).map((r) => {
    const member = getUserByProvider('steam', r.steamId)
    const linked = member && !member.banned ? member : null
    return {
      steamId: r.steamId,
      name: linked?.username || r.charName || 'Unknown vampire',
      member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
      peak: r.peak,
      current: r.current,
    }
  })
  res.json({ rampages: rows })
})

// Server records / Hall of Fame: the first player to fell each V Blood boss this
// season. ?serverId= scopes to one server (default all). Boss GUIDs are resolved
// to display names; unknown ids pass through raw for the client to label neutrally.
app.get('/api/records', (req, res) => {
  const serverId = req.query.serverId ? String(req.query.serverId) : null
  const worldFirsts = getServerRecords(serverId).map((r) => {
    const member = getUserByProvider('steam', r.steamId)
    const linked = member && !member.banned ? member : null
    return {
      bossGuid: r.victim,
      boss: vbloodName(r.victim),
      serverId: r.serverId,
      steamId: r.steamId,
      name: linked?.username || r.charName || 'Unknown vampire',
      member: linked ? { key: keyOf(linked.id), username: linked.username } : null,
      occurredAt: r.occurredAt,
    }
  })
  res.json({ worldFirsts })
})

// Shareable season recap for a player — the numbers behind the downloadable card.
app.get('/api/player/:steamId/recap', (req, res) => {
  const recap = getPlayerRecap(req.params.steamId)
  if (!recap) return res.status(404).json({ error: 'not found' })
  res.json({ recap })
})

// Daily activity for a player's activity heatmap (on /p/:steamId).
app.get('/api/player/:steamId/activity', (req, res) => {
  const days = req.query.days ? Number(req.query.days) : 365
  const activity = getPlayerActivity(req.params.steamId, days)
  res.json({ activity })
})

// Full achievement catalog with holder counts (public).
app.get('/api/achievements', (req, res) => {
  const members = listUsers().filter((u) => !u.banned)
  const memberSteamIds = {}
  for (const u of members) {
    const sid = getUserIdentities(u.id).find((id) => id.provider === 'steam')?.providerId
    if (sid) memberSteamIds[u.id] = sid
  }
  res.json({ achievements: catalogWithCounts(members, memberSteamIds) })
})

// --- Live Discord widget (public) ------------------------------------------
app.get('/api/discord/widget', async (req, res) => {
  const widget = await fetchWidget(process.env.DISCORD_GUILD_ID)
  res.json({ widget })
})

// --- Online players per server (public) -------------------------------------
// Fetches the player list from BattleMetrics server-side (avoids client-side
// CORS/VPN issues). Returns { players: [{ name, steamId, time }] } for one server.
const onlineCache = new Map()
const CACHE_TTL = 30_000 // 30s

// Fetch (and 30s-cache) one server's online player list from BattleMetrics.
// Returns { players: [...] }, or { players: [] } when unconfigured/unreachable.
async function fetchServerOnline(srv) {
  if (!srv?.battlemetricsId) return { players: [] }
  const cached = onlineCache.get(srv.id)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data
  try {
    const bmRes = await fetch(
      `https://api.battlemetrics.com/servers/${srv.battlemetricsId}?include=players`,
      { headers: bmHeaders() },
    )
    if (!bmRes.ok) return { players: [] }
    const body = await bmRes.json()
    const included = body.included || []
    const players = included
      .filter((e) => e.type === 'player')
      .map((e) => {
        const a = e.attributes || {}
        const newPlayer = {
          name: a.name || 'Unknown',
          steamId: a.userId ? String(a.userId) : null,
          time: a.time || null,
        }
        if (newPlayer.steamId) {
          const member = getUserByProvider('steam', newPlayer.steamId)
          const linked = member && !member.banned ? member : null
          if (linked) newPlayer.member = { key: keyOf(linked.id), username: linked.username }
        }
        return newPlayer
      })
      .sort((a, b) => (b.time || 0) - (a.time || 0))
    const data = { players }
    onlineCache.set(srv.id, { at: Date.now(), data })
    return data
  } catch {
    return { players: [] }
  }
}

app.get('/api/servers/:id/online', async (req, res) => {
  const srv = servers.find((s) => s.id === req.params.id)
  res.json(await fetchServerOnline(srv))
})

// In-game chat commands: the mod intercepts "!rank", "!top", etc. and calls this,
// then prints the returned `lines` privately to the player. All wording + colour
// (TextMeshPro <color> tags, which V Rising's chat renders) is built here so the
// mod stays a thin printer — same split as the kill broadcasts.
async function buildCommandLines(cmd, steamId, charName) {
  const c = (hex, s) => `<color=${hex}>${s}</color>`
  const gold = '#ffd24a'
  const who = charName ? String(charName).slice(0, 60) : 'You'

  if (cmd === 'help' || cmd === 'commands') {
    return [
      `Commands: ${c(gold, '!rank')} · ${c(gold, '!top')} · ${c(gold, '!vbloods')} · ${c(gold, '!online')}`,
    ]
  }

  if (cmd === 'rank') {
    if (!steamId) return ['Link your account on the website to get a rank.']
    const lifetime = allTimePoints([steamId])[steamId] ?? 0
    const rows = getLeaderboard({ period: 'all', metric: 'points', limit: 500 })
    const idx = rows.findIndex((r) => r.steamId === steamId)
    const name = (idx >= 0 ? rows[idx].charName : null) || who
    const r = rankForPoints(lifetime)
    const posLabel = idx >= 0 ? `#${idx + 1}` : 'unranked'
    const out = [
      `${c(r.tier.color, name)} — ${c(gold, r.tier.name)} · ${c('#b07bff', posLabel)} · ${lifetime.toLocaleString()} pts`,
    ]
    if (!r.isMax) out.push(`Next: ${c(r.next.color, r.next.name)} in ${r.toNext.toLocaleString()} pts`)
    return out
  }

  if (cmd === 'top') {
    const rows = getLeaderboard({ period: 'all', metric: 'points', limit: 3 })
    if (!rows.length) return ['No ranked vampires yet — go make some history.']
    const medals = ['#ffd24a', '#d8d8e0', '#cd7f4d']
    const parts = rows.map(
      (r, i) => `${c(medals[i] || '#c3aeb9', `${i + 1}. ${r.charName || 'Unknown'}`)} ${r.points.toLocaleString()}`,
    )
    return [`Top 3 — ${parts.join('  ·  ')}`]
  }

  if (cmd === 'vbloods') {
    if (!steamId) return ['Link your account on the website to track V Bloods.']
    const prog = getVBloodHuntProgress(null)[steamId]
    const count = prog ? bossNamesForGuids(prog.bosses).size : 0
    const name = prog?.charName || who
    return [`${c('#7cf267', name)} — ${c(gold, `${count}/${VBLOOD_BOSSES.length}`)} V Bloods felled`]
  }

  if (cmd === 'online') {
    const lists = await Promise.all(servers.map((s) => fetchServerOnline(s)))
    const total = lists.reduce((n, d) => n + d.players.length, 0)
    const per = servers
      .map((s, i) => ({ s, n: lists[i].players.length, bm: !!s.battlemetricsId }))
      .filter((x) => x.bm)
      .map((x) => `${x.s.name.replace(/^V Rising — /, '')} ${x.n}`)
      .join(' · ')
    if (!per) return ['Live player counts are on the website.']
    return [`${c('#7cf267', `${total} online now`)} — ${per}`]
  }

  return null // unknown command → mod sends nothing
}

app.get('/api/mod/cmd', ensureIngestSecret, async (req, res) => {
  const cmd = String(req.query.cmd || '').toLowerCase()
  const steamId = req.query.steamId && /^\d{5,20}$/.test(req.query.steamId) ? String(req.query.steamId) : null
  const charName = req.query.charName ? String(req.query.charName) : null
  try {
    const lines = await buildCommandLines(cmd, steamId, charName)
    res.json({ lines: lines || [] })
  } catch (err) {
    res.status(200).json({ lines: [] })
  }
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
  const post = createNews({ title, body, authorId: req.user.id, authorName: req.user.username })
  res.json({ post })
  if (isWebhookEnabled('news')) announceNews(post) // fire-and-forget (no-op if unconfigured)
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
  const event = createEvent({ title, description, startsAt, location })
  res.json({ event })
  if (isWebhookEnabled('events')) announceEvent(event) // fire-and-forget (no-op if unconfigured)
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

app.post('/api/suggestions', ensureAuth, async (req, res) => {
  if (!(await verifyTurnstile(req.body?.turnstileToken, req.ip))) {
    return res.status(403).json({ error: 'captcha failed' })
  }
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
  // Celebrate notable status changes in Discord (planned / shipped). Fire-and-forget.
  if ((status === 'planned' || status === 'done') && isWebhookEnabled('suggestion')) {
    announceSuggestion({ title: suggestion.title, status })
  }
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
  const all = listUsersAdmin()
  const steamIdMap = {}
  for (const u of all) {
    const sid = getUserIdentities(u.id).find((id) => id.provider === 'steam')?.providerId
    if (sid) steamIdMap[u.id] = sid
  }
  const steamIds = Object.values(steamIdMap)
  const totals = steamIds.length ? getPlayerTotalsBatch(steamIds) : {}
  const users = all.map((u, i) => ({
    ...u,
    rank: i + 1,
    badges: badgesForUser(u, i + 1, totals[steamIdMap[u.id]] || null),
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
  const sid = getUserIdentities(target.id).find((id) => id.provider === 'steam')?.providerId
  const gs = sid ? getPlayerTotals(sid) : null
  res.json({ rank: memberRank(target.id), badges: badgesForUser(target, memberRank(target.id), gs) })
})

// Revoke an achievement badge.
app.delete('/api/admin/users/:id/achievements/:code', ensureAdmin, (req, res) => {
  const target = getUserById(req.params.id)
  if (!target) return res.status(404).json({ error: 'not found' })
  revokeAchievement(target.id, req.params.code)
  logAudit({ actor: req.user, action: 'achievement.revoke', targetId: target.id, targetName: target.username, detail: req.params.code })
  const sid = getUserIdentities(target.id).find((id) => id.provider === 'steam')?.providerId
  const gs = sid ? getPlayerTotals(sid) : null
  res.json({ rank: memberRank(target.id), badges: badgesForUser(target, memberRank(target.id), gs) })
})

// Audit log (most recent first).
app.get('/api/admin/audit', ensureAdmin, (req, res) => {
  res.json({ entries: listAudit(req.query.limit) })
})

// Traffic analytics summary.
app.get('/api/admin/analytics', ensureAdmin, (req, res) => {
  res.json(analyticsSummary(req.query.days))
})

// --- Leaderboard season resets (admin) -------------------------------------
// Non-destructive per-server "season wipe": stores a cutoff timestamp so ranks +
// leaderboard only count that server's activity afterwards. Raw data is preserved,
// so clearing the cutoff restores the full history. Re-resetting saves the old
// cutoff as `previous` (a rolling one-step backup). See server/playtime.js.
app.get('/api/admin/leaderboard/resets', ensureAdmin, (req, res) => {
  res.json({
    resets: getLeaderboardResetsAdmin(),
    servers: servers.map((s) => ({ id: s.id, name: s.name })),
  })
})

app.post('/api/admin/leaderboard/reset', ensureAdmin, (req, res) => {
  const serverId = str(req.body?.serverId, 60)
  // `clear: true` removes the cutoff (restores history); otherwise reset to now.
  const at = req.body?.clear ? null : new Date().toISOString()
  const result = setLeaderboardReset(serverId, at)
  if (result.error) return res.status(400).json({ error: result.error })
  logAudit({
    actor: req.user,
    action: at ? 'leaderboard.reset' : 'leaderboard.reset.clear',
    detail: { serverId, at },
  })
  res.json({ resets: result.resets })
  // A fresh cutoff means a new season — announce it (skip plain clears). Fire-and-forget.
  if (at && isWebhookEnabled('season')) {
    announceSeason({ serverName: servers.find((s) => s.id === serverId)?.name })
  }
})

// Restore a server's cutoff to its previous value (undo a re-reset).
app.post('/api/admin/leaderboard/restore', ensureAdmin, (req, res) => {
  const serverId = str(req.body?.serverId, 60)
  const result = restoreLeaderboardReset(serverId)
  if (result.error) return res.status(400).json({ error: result.error })
  logAudit({
    actor: req.user,
    action: 'leaderboard.reset.restore',
    detail: { serverId },
  })
  res.json({ resets: result.resets })
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
