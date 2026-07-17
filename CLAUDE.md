# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is

**Execute-Gaming** — the community website for a gaming community running
V Rising servers (Easy PvE + Duo PvP). Single-page React site with an Express
backend for Discord/Steam login, roles/admin, and a public members roster.
Live at **https://execute-gaming.se** (self-hosted on Proxmox via PM2 + Caddy).

## Tech stack

- **Frontend:** React 18 + Vite 6 (plain JS/JSX, no TypeScript). One global
  stylesheet `src/index.css` using CSS variables — no CSS framework.
- **Backend:** Express 4 + Passport (Discord via the maintained `passport-oauth2`,
  Steam OpenID), sessions via `express-session` + `session-file-store`.
- **Storage:** SQLite via Node's built-in **`node:sqlite`** (file at
  `server/data/users.db`). No native modules.

## Commands

```bash
npm run dev        # Vite dev server only (frontend)
npm run server     # backend only (port 3001)
npm run dev:all    # both together (use this for local dev) — frontend :5173
npm run build      # production build → dist/
npm start          # production: serves dist/ + API on one port (NODE_ENV=production)
npm run backup     # snapshot server/data/users.db → server/data/backups (keeps 14)
npm run og-image   # regenerate the social-preview PNG (public/og-image.png)
npm run bot-avatar # regenerate the Discord webhook avatar (public/bot-avatar.png)
./deploy.sh        # on the server: pull, install, build, pm2 reload
```

In dev, Vite (`:5173`) proxies `/auth` and `/api` to the backend (`:3001`) — see
`vite.config.js`. This keeps everything same-origin so cookies work.

**Dev vs prod base URL:** `PUBLIC_BASE_URL` is only used when `NODE_ENV=production`.
In dev the backend always uses `http://localhost:5173` for OAuth callbacks and the
post-login redirect, so a production `PUBLIC_BASE_URL` in `.env` won't bounce you to
the live domain while developing — the same `.env` works on your machine and the VM.
(Discord's app must whitelist **both** redirect URIs: the localhost and the prod one.)

## Architecture

### Frontend (`src/`)

- `main.jsx` wraps `<App>` in `<AuthProvider>`.
- `main.jsx` also wraps `<App>` in `<ConfirmProvider>` — `useConfirm()` exposes
  promise-based `confirm()`/`prompt()` rendered as styled modals (no native popups).
- `App.jsx` composes the home page (Hero → Servers → News → Community → Rules)
  and does tiny client-side routing via a `PAGES` map: `/events`, `/members`,
  `/rules`, `/achievements`, `/suggestions`, `/clans` render that one section as a
  standalone page (`/rules` = the full Duo PvP ruleset, `components/RulesPage.jsx` —
  distinct from the short home `Rules` teaser), `/u/:key` renders `<PublicProfile>`,
  `/p/:steamId` `<PlayerProfile>`,
  `/c/:clanGuid` `<ClanProfile>`, everything else is the home page. It also
  fires the privacy-friendly page-view beacon (`POST /api/hit`).
- `components/Hero.jsx` layers a self-drawn SVG scene (`public/hero-bg.svg`:
  blood moon, castle silhouette, bats) + CSS embers behind the hero copy. All
  art is original; animations respect `prefers-reduced-motion`.
- `lib/router.js` — dependency-free History-API router (`usePath`, `navigate`,
  `linkProps`). `navigate` also handles `/#section` links (jump to a home
  section) and scroll-to-top on plain page changes. The SPA fallback
  (`app.get('*')` in prod, Vite in dev) serves these deep links.
- `data/servers.js` — **single source of truth** for server cards + community
  links (Discord invite, name). Edit content here.
- `data/achievements.js` — **single source of truth** for the badge catalog,
  imported by BOTH the frontend and the backend (`server/achievements.js`).
  Auto badges (`auto: true`) are computed; the rest are admin-granted.
- `services/serverStatus.js` + `hooks/useServerStatus.js` — live status. V Rising
  uses BattleMetrics (`battlemetricsId`); anything without one falls back to mock.
- `auth/AuthContext.jsx` — `useAuth()` exposes `{ user, loading, providers,
  turnstile, logout }`. Fetches `/api/me` and `/api/config` on load (`turnstile`
  is `{ enabled, siteKey }` for the CAPTCHA widget).
- `components/Turnstile.jsx` — reusable Cloudflare Turnstile widget (loads the CF
  script once, renders nothing when CAPTCHA is disabled). Used by `LoginModal` and
  `Suggestions`. Reports its token via `onVerify(token|null)`; bump `resetSignal`
  to force a fresh challenge after a token is consumed.
- `components/` — Navbar, Hero, Servers/ServerCard, Community, Members, Rules,
  Footer, LoginModal, ProfileModal.

### Backend (`server/`)

- `index.js` — Express app, routes, session setup. In production also serves
  `dist/` with an SPA fallback.
- `auth.js` — Passport strategies. **Only registered if their env creds exist**,
  so the server boots even without them. Discord uses `passport-oauth2` with a
  custom `userProfile` that fetches `/users/@me`; verify also syncs guild roles.
- `discord.js` — fetches the user's roles in the guild (OAuth), resolves role
  names/colours (optional bot token), and fetches the public **guild widget**
  (`fetchWidget`, 60s cache) for the live "who's online" component. Also the
  **outbound announcements webhook**: `postWebhook()` + `announceNews/Event/
  Announcement/RankUp()` post rich embeds to a Discord channel via
  `DISCORD_WEBHOOK_URL` (an incoming webhook — no bot). Everything is **fail-open**
  (missing URL or network error → returns false, never throws) and callers
  fire-and-forget after sending their HTTP response, so a webhook never blocks or
  breaks the request. Embed links use `PUBLIC_BASE_URL`; the bot posts as
  "Execute-Gaming" with `/bot-avatar.png` (generate via `npm run bot-avatar`).
  Categories: news, events, announcement, rank-ups, suggestion updates (planned/
  shipped), season resets and community milestones — each gated by a per-category
  toggle (`webhook_<key>` in `content.js`, default ON) so an admin can mute one kind.
  `announceTest()` backs the `/admin` "Send test message" button.
- `db.js` — the shared `node:sqlite` connection and **all table schema**
  (users, news, events, suggestions, server_stats, settings, achievements,
  audit_log, page_views, play_sessions, kill_events, player_ranks, user_identities)
  + idempotent column migrations.
- `store.js` — user CRUD + role logic + ban/note (`setBan`, `setNote`,
  `listUsersAdmin`). Auto-migrates from a legacy `users.json`. Public serialisers
  never leak `note`/`banReason`; those come only from admin endpoints.
  **Account linking:** the `user_identities` table maps each `(provider,
  providerId)` to an owning account, so one account can own both a Discord and a
  Steam identity. `loginWithProvider()` (used by the strategies) signs in as the
  owning account when the identity is linked; `getUserByProvider()` resolves
  through it (so a linked SteamID attributes to the member on the leaderboard);
  `linkProviderToUser()` merges any standalone account for that identity into the
  primary (`mergeAccounts()` moves achievements/votes, transactional) then points
  the identity at the primary; `unlinkProvider()` drops a link (never the sign-in
  provider). Every account keeps its own self-identity (backfilled in `db.js`).
- `content.js` — CRUD for news, events, suggestions (+ votes), plus the
  site-wide announcement banner (stored in a key/value `settings` table).
- `achievements.js` — grant/revoke stored badges + compute auto ones; imports
  the shared catalog from `src/data/achievements.js`.
- `turnstile.js` — Cloudflare Turnstile (CAPTCHA) verification. `verifyTurnstile()`
  checks a widget token against Cloudflare's siteverify; **fail-open when unconfigured**
  (returns true if the keys aren't set, like the OAuth/webhook integrations) so dev
  works without keys. Enabled only when both `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
  are set. Guards login (`ensureLoginCaptcha`) and `POST /api/suggestions`.
- `audit.js` — `logAudit()` / `listAudit()` for the admin action log.
- `analytics.js` — privacy-friendly page-view counter (`recordHit`, `summary`);
  no cookies/IPs/PII, aggregate counts only.
- `stats.js` — background poller that snapshots each server's BattleMetrics
  player count (every `STATS_POLL_MINUTES`, default 5) into `server_stats`, plus
  `getHistory()`. Imports the shared `src/data/servers.js` for the server list.
  Also `getLiveStatus(serverId)` — the **server-side status proxy** behind
  `GET /api/servers/:id/status` (30s cache): fetches BattleMetrics on the server so
  the browser never calls it directly (a visitor's VPN/adblock/CORS used to blank the
  card). `serverStatus.js` on the frontend now calls this same-origin proxy.
- `playtime.js` — the **leaderboard**. `recordSession()` validates + UPSERTs a play
  session (keyed by a mod-issued `sessionId`, so heartbeats and the final disconnect
  are idempotent — no double counting); `recordKill()` records a V Blood/PvP kill
  (keyed by a per-kill `eventId` via INSERT OR IGNORE — retries can't double-count).
  `getLeaderboard({ metric, serverId, period })` returns one unified ranking across
  playtime + kills: every row carries `seconds/vblood/pvp/points`, and `metric`
  (`points|playtime|vblood|pvp`) picks the sort. `points` is a weighted blend
  (`POINTS` weights) recomputed from raw rows each request, so tweaking the weights
  reweights all history instantly. **V Blood points reward variety:** the first time
  a player fells a given boss is worth `perVBloodFirst` (50); every repeat kill of
  that same boss is worth `perVBloodRepeat` (25). This is derived in SQL from a
  `COUNT(DISTINCT victim)` (no per-kill flag stored). `allTimePoints(steamIds,
  serverId=null)` returns a lifetime-points map (same weighting, ignoring the *period*
  filter) for the rank badge; pass a `serverId` to scope the total to one server
  (per-server rank), or `null` to sum across all servers (global rank). Data comes
  from the in-game BepInEx mod (`mod/`) via `POST /api/ingest/session` + `/api/ingest/kill`.
  Also exports: `getPlayerStats(steamId)` (per-server breakdown for `/p/:steamId` guest
  profiles), `getPlayerTotals`/`getPlayerTotalsBatch` (lightweight aggregate for
  auto-achievement checks), `getRecentKills(serverId, limit)` (live kill feed),
  `getVBloodHuntProgress(serverId)` (boss kill matrix for `/hunt`), `getPlayerActivity(
  steamId, days)` (daily playtime for activity heatmap), `getSeasonChampions(serverId)`
  (top-1 per completed season for the hall-of-fame panel), `getGlobalStats()` +
  `getHottestFeud()` (community-milestones strip), `getRivalries(steamId)` (Nemesis +
  Favourite prey from PvP `kill_events` — note PvP `victim` is a *charName*, so nemeses
  resolve by killer SteamID while prey resolve name→latest SteamID), and
  `getPlayerStreak(steamId)` / `getTopStreaks()` (consecutive-day play streaks, UTC days).
  `getRecentKills` takes an optional `kind` (`'pvp'`/`'vblood'`) to filter the feed.
  **Season recap:** `getPlayerRecap(steamId)` assembles the shareable card's numbers
  (playtime/kills/raids/points, global rank + percentile, top nemesis, a computed
  archetype) — the data behind `components/SeasonRecap.jsx` on `/p/:steamId` + `/u/:key`.
  **PvP rating (Elo):** `getPvpLeaderboard(limit)` / `getPvpRating(steamId)` replay all
  PvP kills chronologically as 1v1 matches (start 1000, K=32, <3 duels = provisional),
  memoised on a cheap kill-count signature — the `/pvp` hub + the profile rating block.
  **Killstreaks + world-first (live hype):** `recordKill` also returns `highlights` —
  a PvP `streak` (consecutive kills since the killer's last death, inclusive) with a
  `milestone` flag (tiers `RAMPAGE_TIERS` = 3/5/7/10, then every 5) and any `endedName`/
  `endedStreak` (a rampage this kill broke), or a V Blood `worldFirst` (no earlier kill
  of that boss on that server this season). `index.js`'s `buildKillBroadcasts()` turns
  these into the strings the mod prints to global chat. As lasting records:
  `getServerRecords(serverId)` is the world-first-per-boss Hall of Fame, and
  `getTopRampages(limit)` is the biggest-killstreak board (replay memoised like Elo;
  shares `pvpIdentityMaps()`). Season-floored like everything else.
  **Clans:** `getClanLeaderboard({ metric, serverId, period })` ranks clans (keyed by
  the stable `clanGuid`, shown under the latest captured `clanName`) with the same
  POINTS weighting summed across members; `getClanStats(clanGuid)` returns one clan's
  totals + roster + distinct bosses; `getClanWars(clanGuid)` is the clan-vs-clan PvP
  record (kills we landed vs deaths taken, per rival clan, from `victimClanGuid` on
  PvP kills); `getHottestClanWar()` is the single most active clan feud for the
  milestones strip. Clan attribution is denormalised at event time (clanGuid/clanName
  on each session + kill, victimClan* on PvP kills) so clan stats recompute from raw
  rows like everything else — no membership table.
  **Castle raids (mod v0.4.0):** `recordRaid(body)` ingests one `raid_events` row per
  raid (attacker = raider, defender = raided castle owner; either side's steamId/clan
  may be null). `getRaidFeed(serverId, limit)` is the recent-raids feed on `/clans`;
  `getClanRaidRecord(clanGuid)` returns `{ raidsDone, raidsSuffered, rivals[] }` for the
  clan profile; `getTopRaiderClan()` is the "most feared raiders" for the milestones
  strip. `getGlobalStats()` also returns a `raids` count. `clanNameForGuid` also reads
  `raid_events`, so a clan seen only via raids still resolves to a name.
  Also `checkRankPromotion(steamId)` — recomputes the player's GLOBAL all-time rank
  tier after each ingest and compares it to the highest tier stored in the
  `player_ranks` table. First sighting seeds the current tier **silently** (returns
  null, so enabling the Discord webhook never announces ranks players already held);
  afterwards it only returns a promotion `{ from, to, tier, points }` on an upward
  move (a season reset that lowers points lowers the stored tier silently). The
  ingest routes call it fire-and-forget and hand any promotion to `announceRankUp()`.
  Also `checkMilestones()` — watches cumulative community totals (`getGlobalStats`)
  and returns round thresholds (hours/V Bloods/PvP kills) newly crossed since last
  check; like ranks it seeds silently (`milestone_*` settings, high-water mark) so a
  season reset never re-announces. Ingest hands crossings to `announceMilestone()`.
- `src/data/ranks.js` — **single source of truth** for the **rank ladder** ("Vampire
  Ascension": Fledgling → … → Dracula, 8 point-threshold tiers). `rankForPoints(points)`
  resolves a lifetime-points total to its tier + progress to the next. Rendered as a
  coloured pill on each leaderboard row and as a progress badge on `/u/:key` profiles.
  Rank is **all-time** (independent of the leaderboard's *period* filter) but **per
  server**: the leaderboard pill follows the active server filter (global on "All
  servers"), and profiles show the global rank plus a per-server breakdown.

### Key routes

- `GET /auth/discord`, `/auth/steam` (+ `/callback`) — OAuth login
- `GET /auth/discord/link`, `/auth/steam/link` — **link** that provider to the
  signed-in account (same callback, branched via a `session.linking` flag; uses
  `passport.authenticate(..., { assignProperty: 'account' })` so the session user
  isn't replaced). Redirects back with `?linked=` / `?linkerror=`.
- `POST /auth/logout`
- `GET /api/me` — current user (+ `key`, `rank`, `badges`, `identities`) or null
- `POST /api/me/unlink` — unlink a connected provider (not your sign-in one)
- `PUT /api/me/profile` — update your own bio + favourite server (auth)
- `GET /api/config` — which providers are enabled + `turnstile: { enabled, siteKey }`
  (public CAPTCHA site key). When CAPTCHA is on, `GET /auth/discord|steam` require a
  valid `?ts=` Turnstile token (`ensureLoginCaptcha`) and `POST /api/suggestions`
  requires `turnstileToken` in the body — both no-ops when Turnstile is unconfigured.
- `GET /api/announcement` (public), `PUT /api/announcement` (admin) — site banner
- `GET /api/members` — **public** roster (hashed key, safe fields, badges; banned hidden)
- `GET /api/profile/:key` — **public** single profile for `/u/:key` pages
  (includes `points`: `{ overall, perServer: [{ serverId, name, accent, points }] }`
  — the member's all-time leaderboard points globally + per server, for the rank
  badge; `null` if they have no linked Steam identity. Also `steamId` for the
  activity heatmap.)
- `GET /api/player/:steamId` — **public** game stats for any player (guest profile
  at `/p/:steamId`). Works for unregistered players: playtime, kills, points, rank,
  per-server breakdown, latest V Blood. Includes `member` link if registered.
  per-server breakdown, latest V Blood. Also includes `pvpRating` (Elo, or null).
- `GET /api/player/:steamId/activity?days=` — **public** daily playtime for the
  activity heatmap (array of `{ date, seconds }`).
- `GET /api/player/:steamId/recap` — **public** season-recap numbers for the shareable
  card (`components/SeasonRecap.jsx`). 404 for players with no tracked activity.
- `GET /api/pvp/leaderboard?limit=` — **public** PvP Elo ladder (established fighters,
  best rating first), for the `/pvp` hub.
- `GET /api/pvp/rampages?limit=` — **public** biggest PvP killstreaks this season
  (`peak` + live `current`), for the Biggest-Rampages board on `/pvp`.
- `GET /api/records?serverId=` — **public** world-first V Blood kills (first player to
  fell each boss this season, per server), for the Hall of Fame on the hunt tracker.
- `GET /api/kills/recent?serverId=&limit=&kind=` — **public** live kill feed (latest V Blood
  + PvP kills, newest first, with resolved boss names + member link keys). Optional
  `kind=pvp`/`kind=vblood` filters the feed (the `/pvp` hub uses `kind=pvp`).
- `GET /api/vblood-hunt?serverId=` — **public** V Blood hunt tracker (per-player boss
  kill sets, sorted by kill count).
- `GET /api/season-champions` — **public** top-1 player per completed season per
  server (between consecutive resets).
- `GET /api/global-stats` — **public** community milestones (total hours/V Bloods/PvP
  kills/players) + hottest PvP feud + hottest **clan** war + top play streaks (for the
  leaderboard's `<Milestones>` strip).
- `GET /api/player/:steamId/rivalries` — **public** Nemesis + Favourite prey + play
  streak for a player. Keyed by SteamID so members (`/u/:key`) and guests
  (`/p/:steamId`) share the same `<Rivalries>` component.
- `GET /api/features` (public) / `PUT /api/features` (admin) — leaderboard panel
  visibility toggles (`milestones`/`highlights`/`champions`, **default ON**). The
  `<Leaderboard>` hides a panel when its flag is off; admins toggle them in
  `/admin` → Settings. Kill feed has its own `/api/killfeed/enabled` (default OFF).
- `GET /api/servers/:id/status` — **public** live status for one server, proxied
  server-side from BattleMetrics (30s cache) so the browser never calls it directly.
- `GET /api/webhook` (admin) — Discord webhook status (`configured`) + per-category
  flags. `PUT /api/webhook` (admin) toggles one category. `POST /api/webhook/test`
  (admin) fires a test embed (400 if `DISCORD_WEBHOOK_URL` unset). Wired into
  `/admin` → Settings.
- `GET /api/discord/widget` — **public** live guild widget (who's online)
- `POST /api/hit` — **public** analytics beacon (no PII)
- `GET /api/servers/:id/history?hours=` — **public** player-count history
  (rendered by `components/PlayerHistoryChart.jsx`, a dependency-free SVG chart)
- `GET /api/leaderboard?metric=points|playtime|vblood|pvp&serverId=&period=all|30d|7d&limit=`
  — **public** leaderboard. Every row carries all metrics; `metric` (default
  `points`) picks the ranking. Each row also carries `allTimePoints` (lifetime
  points for the rank pill — independent of the *period* filter, but scoped to the
  active *server* filter: global on "All servers", per-server otherwise). Rows link to
  member profiles where the SteamID matches a Steam login. Rendered by
  `components/Leaderboard.jsx` (metric tabs + per-row rank pill from `src/data/ranks.js`).
- `GET /api/clans?metric=&serverId=&period=` — **public** clan leaderboard (one row
  per clan, keyed by `clanGuid`, shown under its latest name). Rendered by
  `components/ClanLeaderboard.jsx` at `/clans`.
- `GET /api/clan/:clanGuid` — **public** one clan's profile (totals, roster with
  member links, clan-vs-clan war record, and a castle-raid record). 404 if the clan has
  no tracked activity. Rendered by `components/ClanProfile.jsx` at `/c/:clanGuid`.
- `GET /api/raids?serverId=&limit=` — **public** recent castle raids (the raid feed on
  `/clans`). Each side resolved to a clan (linked to `/c/:guid`) and/or a player.
  Rendered by `components/RaidFeed.jsx`.
- `POST /api/ingest/session`, `POST /api/ingest/kill` and `POST /api/ingest/raid` —
  ingest from the in-game mod. **Not** user-auth; all guarded by a shared secret
  (`INGEST_SECRET`, header `X-Ingest-Secret`) and **fail closed** (503) if the secret
  isn't set. `kill` body is `{ eventId, serverId, steamId, charName, kind: vblood|pvp,
  victim, occurredAt, clanGuid?, clanName?, victimClanGuid?, victimClanName?,
  victimSteamId? }` (`victimSteamId`, mod v0.7.0, PvP only, is the dead player's
  SteamID — `getRivalries` prefers it and falls back to victim-name matching on older
  rows; column auto-migrates via `ensureColumn`);
  `session` body adds `clanGuid?`/`clanName?`; `raid` body is `{ eventId, serverId,
  kind:"raid", occurredAt, attacker*, defender* }` (steamId/name/clanGuid/clanName per
  side, all optional). Clan fields are optional (empty = clanless).
  `POST /api/ingest/kill` responds `200 { ok, broadcasts:[...] }` — the strings the mod
  prints to global chat (killstreak/world-first hype; usually empty). The mod parses
  them from the response and queues them for its game thread (`BroadcastQueue`).
  After a successful ingest both routes fire-and-forget `checkRankPromotion(steamId)`
  and, on a promotion, post a "rank up" embed to Discord (see `discord.js`).
- `GET /api/mod/cmd?cmd=<rank|top|vbloods|online|help>&steamId=&charName=` (mod v0.6.0,
  `X-Ingest-Secret`-guarded) — powers in-game chat commands. Returns `{ lines:[...] }`,
  the ready-to-print reply the mod sends privately to the player. `buildCommandLines()`
  computes the wording; broadcast/command strings carry **TextMeshPro `<color=#hex>` tags**
  (V Rising's chat renders colour but not emoji — emoji show as boxes). `online` reuses
  `fetchServerOnline()` (BattleMetrics, 30s-cached).
- `GET /api/news` (public), `POST/PUT/DELETE /api/news/:id` (admin)
- `GET /api/events` (public), `POST/PUT/DELETE /api/events/:id` (admin)
- `GET /api/suggestions` (public), `POST` (auth), `POST /:id/vote` (auth),
  `PATCH /:id/status` (admin), `DELETE /:id` (author or admin)

Admin-only (`ensureAdmin`):
- `GET /api/admin/users` — full roster with notes/ban/badges/rank
- `POST /api/admin/users/:id/ban` — `{banned, reason}` (can't ban yourself)
- `POST /api/admin/users/:id/note` — private admin note
- `POST /api/admin/users/:id/achievements` — grant `{code}` (from `GRANTABLE`)
- `DELETE /api/admin/users/:id/achievements/:code` — revoke a badge
- `GET /api/admin/audit?limit=` — admin action log
- `GET /api/admin/analytics?days=` — page-view summary

Guards: `ensureAuth` (logged in), `ensureAdmin` (admin role). All admin
mutations are recorded via `logAudit`. Mutating requests are rate-limited
per-IP; see `SECURITY.md`.

## Roles & admin

- Roles: `member` | `admin`. Admin is **entirely env-driven and recomputed on
  every login** (`store.js#upsertUser`): you're an admin iff your Discord user id
  is in `DISCORD_ADMIN_USER_IDS` **or** you hold a role in `DISCORD_ADMIN_ROLE_IDS`.
- There is **no bootstrap** (first login is a normal member) and **no in-app
  promote/demote** — roles come only from `.env`. Removing someone from both env
  vars demotes them on their next login.
- `DISCORD_ADMIN_USER_IDS` is the lockout-proof path (doesn't depend on Discord
  role sync being available), so pin at least your own id there.

## Environment (`.env`)

Copy `.env.example` → `.env`. Contains **real secrets — never commit it**
(gitignored). Keys: `SESSION_SECRET`, `PUBLIC_BASE_URL`, `DISCORD_CLIENT_ID/
SECRET`, `DISCORD_GUILD_ID`, `DISCORD_ADMIN_ROLE_IDS`, `DISCORD_ADMIN_USER_IDS`
(pin admins by raw Discord user id), `DISCORD_BOT_TOKEN` (optional, for role
names/colours), `DISCORD_WEBHOOK_URL` (optional — posts news/events/banner/rank-up
embeds to a Discord channel; blank = disabled), `STEAM_API_KEY`,
`STATS_POLL_MINUTES` (optional, default 5),
`INGEST_SECRET` (shared secret for the leaderboard mod's session ingest; leave
blank to disable ingest — the endpoint then returns 503),
`TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (optional Cloudflare Turnstile CAPTCHA
on login + suggestions; **both** must be set to enable it, else it's skipped).
In production also set `NODE_ENV=production` and `PUBLIC_BASE_URL=https://execute-gaming.se`.
**In production the server refuses to boot** if `SESSION_SECRET` is unset or the
default (forgeable cookies) — set a long random string.

## Deployment

Self-hosted: PM2 runs `server/index.js` (`ecosystem.config.cjs`), Caddy
reverse-proxies `execute-gaming.se` → `localhost:3001` and handles HTTPS.
`trust proxy` + secure cookies are already set for behind-a-proxy HTTPS.
Update with `./deploy.sh`. Discord OAuth redirect must be registered:
`https://execute-gaming.se/auth/discord/callback`.

### Backups

`npm run backup` writes a consistent snapshot (SQLite `VACUUM INTO`) to
`server/data/backups/` and prunes to the newest 14. Schedule it nightly on the
server with cron, e.g.:

```cron
15 4 * * *  cd /path/to/Website && /usr/bin/node scripts/backup.mjs >> server/data/backups/backup.log 2>&1
```

Override the target dir / retention with `BACKUP_DIR` and `BACKUP_KEEP`. For
off-VM safety, point `BACKUP_DIR` at a mounted/synced location or rsync the
folder afterwards.

### Social preview (SEO)

Open Graph / Twitter tags live in `index.html`; the card image is
`public/og-image.png`, generated by `npm run og-image` (pure Node, no deps —
edit `scripts/make-og-image.mjs` to change wording, then re-run and commit the
PNG).

## Companion: playtime leaderboard mod

The leaderboard's data comes from a **separate C# BepInEx mod** that runs on the
V Rising game server, not from this repo. It lives in `../mod/` (sibling of
`Website/`) — see `mod/ExecuteGaming.PlaytimeTracker/` and its own `CLAUDE.md`.

- The mod POSTs play sessions to `POST /api/ingest/session` and V Blood/PvP kills to
  `POST /api/ingest/kill` (this repo), both guarded by the shared `INGEST_SECRET`.
  Contract + validation live in `server/playtime.js`. The mod's kill hooks are
  **verified live** (death-based detection in `DeathEventListenerSystem`, mod v0.2.2).
- **Clans (mod v0.3.0):** the mod also captures each player's clan (stable `ClanGuid`
  + name, from `User.ClanEntity` → `ClanTeam`) on sessions/kills and the victim's clan
  on PvP kills. The site denormalises these at ingest time and powers `/clans` +
  `/c/:clanGuid`. Clan fields are optional/empty for clanless players — old mod
  versions that don't send them just produce no clan stats (graceful).
- **Castle raids (mod v0.4.0):** the mod reports a raid (`POST /api/ingest/raid`) when
  a player raids a castle heart — attacker (from `CastleHeartEventSystem.ProcessRaidEvent`
  → `FromCharacter`) and defender (the heart's owner), each resolved to a clan. Powers
  the raid feed on `/clans`, the per-clan raid record on `/c/:clanGuid`, and the "most
  feared raiders" milestone. The raid hook is **built + compile-verified but pending
  live verification** (raids are rare and can't be staged in a smoke test — like the
  kill hooks before v0.2.2); the mod logs `→ Raid:` for the first live raid.
- The site side is self-contained and testable **without** the game: set
  `INGEST_SECRET`, `curl` a session/kill in, and read `GET /api/leaderboard`.
- To change either ingest contract, update **both** `server/playtime.js` (validation)
  and the mod's `IngestClient` so they stay in sync.
- **"Latest Kill":** each leaderboard row shows the player's most recent V Blood boss
  ("🩸 Latest Kill: Alpha Wolf"). `getLeaderboard` returns the latest in-window `kill_event`
  per SteamID (`lastVBlood` guid + `lastVBloodAt`); the route resolves the guid via
  `src/data/vbloods.js` (`vbloodName()`), which maps all 64 V Blood bosses' PrefabGUIDs
  → names from the V Rising Mod Wiki prefab dump. It also maps the 22 **Primal / Gate
  Boss** variant GUIDs (`CHAR_..._GateBoss_*`, spawned on Brutal servers like our Duo
  PvP one) to the same boss names — without these, Primal kills showed "V Blood boss".
  Any unmapped id (e.g. a new boss after a game update) renders a neutral "V Blood
  boss" label client-side. For "X of Y" completion, use `VBLOOD_BOSSES` (64 distinct
  names) / `bossNamesForGuids()` — never `Object.keys(VBLOOD_NAMES)` (86, counts Primals
  twice); the `/api/vblood-hunt` route already collapses variants by name.

## Gotchas

- **Node 22.5+ required** (24 recommended) for `node:sqlite`. Older Node crashes
  at startup with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.
- After a Node upgrade, **`pm2 kill`** then restart — the PM2 daemon caches the
  old Node binary otherwise.
- An `ExperimentalWarning: SQLite ...` at startup is normal, not an error.
- `server/data/` (DB + sessions) and `.env` are gitignored. Back up
  `server/data/` for user data.
- Adding an OAuth scope means existing users must log in again to grant it.
- Discord login uses `passport-oauth2` (maintained) with a hand-written profile
  fetch, not `passport-discord` (which is unmaintained and was removed).
- Banned members are hidden from the roster and logged out on next login
  (`/?login=banned`); they aren't force-killed from an existing session.
- **Account linking** keeps each account's original `id` (`provider:providerId`)
  as the primary; linking Steam to a Discord-primary means role/admin still derive
  from the Discord login (the primary), and the Steam login now resolves to that
  same account. Linking **merges and deletes** any standalone account the second
  identity had, so its old separate profile/URL disappears (its achievements move
  over; play-time/kills re-attribute automatically via `getUserByProvider`).
- The Discord widget needs "Enable Server Widget" turned on in Discord; without
  it the API returns 403 and the on-site widget simply hides itself.
- The leaderboard stays empty until `INGEST_SECRET` is set **and** the game mod is
  running and reporting. With no secret, `/api/ingest/session` returns 503 (a safe
  "off"), and `/api/leaderboard` just returns an empty list — neither is an error.
  **Debugging an empty live leaderboard** — probe the ingest endpoint: `503` = no
  secret set on the site; `401` = a secret *is* set (so the site is fine — the mod's
  `.cfg` has the wrong/old secret or is pointing at localhost); `400` on a bad body
  but correct secret = auth passes and the site is healthy, so the gap is upstream
  (mod not running / wrong `Url` / can't reach the host). The usual cause is the
  game-server mod `.cfg`, not the site.
- **Live server status is proxied server-side** — `src/services/serverStatus.js`
  calls our own `GET /api/servers/:id/status` (same-origin), which fetches
  BattleMetrics on the server (`getLiveStatus` in `server/stats.js`, 30s cache). So a
  visitor's VPN/adblock/CORS no longer blanks the card. If the **server** can't reach
  BattleMetrics the proxy serves the last cached value, else `state: 'unknown'`.
  Servers without a `battlemetricsId` (e.g. CS 1.6) still use the client-side mock.

## Conventions

- Match the surrounding style: functional React components, hooks, plain JSX.
- Keep content/config in `src/data/servers.js`, styles in `src/index.css`.
- Keep all persistence behind `server/store.js`.
- User-facing copy is in **English**.
- The `/leaderboard` page (`components/Leaderboard.jsx`) composes several widgets:
  `<ChampionCard>` (hero spotlight of the reigning all-time Points #1, at the top of
  `.lb-main`), `<Milestones>` (community-wide counters + hottest feud + top streaks),
  `<SeasonChampions>`, `<WeeklyHighlights>`, `<KillFeed>`, and the ranked list itself (paginated 20/page,
  rank/medals global across pages). In the "All servers" view each row shows a
  **home-server tag** beside its points/metric value (the server that player has logged
  the most time on + its % share when split across servers), resolved server-side by
  `topServers()` in `server/playtime.js` and attached as `entry.homeServer = { id, share }`
  by the `/api/leaderboard` route (only when no single server is selected). `<Rivalries>`
  (Nemesis + prey + streak) is shared by
  both profile types. Emoji medals must be indexed from an array, not a string — emoji
  are surrogate pairs, so `'🥇🥈🥉'[i]` returns half a code point (renders as tofu).
- Both profile pages (member `/u/:key` → `components/PublicProfile.jsx`, guest
  `/p/:steamId` → `components/PlayerProfile.jsx`) show a **per-server playtime split**
  (stacked bar + legend, e.g. "Easy PvE 60% · Duo PvP 40%") via the reusable
  `components/ServerSplit.jsx`. It needs `seconds` per server: player profiles get it from
  `getPlayerStats().perServer`; the member profile's `pointsForUser()` fills it via the
  `serverPlaytime(steamIds, period)` helper in `server/playtime.js` (sums a member's
  linked SteamIDs, respects period + reset floors).
- **Theme:** a Cinzel gothic display font (`--font-display`, loaded in `index.html`)
  and blood/venom palette tokens in `:root` (`--blood-*`, `--venom-*`) give the
  leaderboard panels a gothic V Rising look. Reuse those tokens for new panels.
- **Motion/finish primitives** (all `prefers-reduced-motion`-safe): `hooks/useInView.js`
  (`useInView()` one-shot IntersectionObserver + `prefersReducedMotion()`),
  `components/Reveal.jsx` (wrap a section to fade/rise it in on scroll), and CSS
  helpers `.sk`/`.sk--*` (shimmer skeleton placeholders — mirror the real layout so
  there's no jump) and `.reveal`. Prefer a skeleton over a bare "Loading…" string for
  new data panels, and reuse `useInView` for any scroll-triggered animation.

See `ROADMAP.md` for planned features.
