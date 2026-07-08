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
- **Backend:** Express 4 + Passport (Discord OAuth2, Steam OpenID), sessions via
  `express-session` + `session-file-store`.
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
./deploy.sh        # on the server: pull, install, build, pm2 reload
```

In dev, Vite (`:5173`) proxies `/auth` and `/api` to the backend (`:3001`) — see
`vite.config.js`. This keeps everything same-origin so cookies work.

## Architecture

### Frontend (`src/`)

- `main.jsx` wraps `<App>` in `<AuthProvider>`.
- `App.jsx` composes sections: Hero → Servers → Community → Members → Rules.
- `data/servers.js` — **single source of truth** for server cards + community
  links (Discord invite, name). Edit content here.
- `services/serverStatus.js` + `hooks/useServerStatus.js` — live status. V Rising
  uses BattleMetrics (`battlemetricsId`); anything without one falls back to mock.
- `auth/AuthContext.jsx` — `useAuth()` exposes `{ user, loading, providers,
  logout }`. Fetches `/api/me` and `/api/config` on load.
- `components/` — Navbar, Hero, Servers/ServerCard, Community, Members, Rules,
  Footer, LoginModal, ProfileModal.

### Backend (`server/`)

- `index.js` — Express app, routes, session setup. In production also serves
  `dist/` with an SPA fallback.
- `auth.js` — Passport strategies. **Only registered if their env creds exist**,
  so the server boots even without them. Discord verify also syncs guild roles.
- `discord.js` — fetches the user's roles in the guild (OAuth) and resolves role
  names/colours (optional bot token).
- `db.js` — the shared `node:sqlite` connection and **all table schema**.
- `store.js` — user CRUD + role logic. Auto-migrates from a legacy `users.json`.
- `content.js` — CRUD for news, events, suggestions (+ votes), plus the
  site-wide announcement banner (stored in a key/value `settings` table).
- `stats.js` — background poller that snapshots each server's BattleMetrics
  player count (every `STATS_POLL_MINUTES`, default 5) into `server_stats`, plus
  `getHistory()`. Imports the shared `src/data/servers.js` for the server list.

### Key routes

- `GET /auth/discord`, `/auth/steam` (+ `/callback`) — OAuth login
- `POST /auth/logout`
- `GET /api/me` — current user or null
- `PUT /api/me/profile` — update your own bio + favourite server (auth)
- `GET /api/config` — which providers are enabled
- `GET /api/announcement` (public), `PUT /api/announcement` (admin) — site banner
- `GET /api/members` — **public** roster (hashed key, safe fields only)
- `GET /api/servers/:id/history?hours=` — **public** player-count history
  (rendered by `components/PlayerHistoryChart.jsx`, a dependency-free SVG chart)
- `GET /api/admin/users`, `POST /api/admin/users/:id/role` — admin-only
- `GET /api/news` (public), `POST/PUT/DELETE /api/news/:id` (admin)
- `GET /api/events` (public), `POST/PUT/DELETE /api/events/:id` (admin)
- `GET /api/suggestions` (public), `POST` (auth), `POST /:id/vote` (auth),
  `PATCH /:id/status` (admin), `DELETE /:id` (author or admin)

Guards: `ensureAuth` (logged in), `ensureAdmin` (admin role).

## Roles & admin

- Roles: `member` | `admin`. Resolution order in `store.js#upsertUser`:
  pinned (`ADMIN_IDS`) **or** synced Discord admin role (`DISCORD_ADMIN_ROLE_IDS`)
  → existing role → **bootstrap** (if no admin exists yet, next login becomes
  admin — prevents lock-out) → member.
- Losing a Discord admin role does **not** auto-demote; demote via the admin
  Members panel.

## Environment (`.env`)

Copy `.env.example` → `.env`. Contains **real secrets — never commit it**
(gitignored). Keys: `SESSION_SECRET`, `PUBLIC_BASE_URL`, `DISCORD_CLIENT_ID/
SECRET`, `DISCORD_GUILD_ID`, `DISCORD_ADMIN_ROLE_IDS`, `DISCORD_BOT_TOKEN`
(optional, for role names/colours), `STEAM_API_KEY`, `ADMIN_IDS` (optional),
`STATS_POLL_MINUTES` (optional, default 5).
In production also set `NODE_ENV=production` and `PUBLIC_BASE_URL=https://execute-gaming.se`.

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

## Gotchas

- **Node 22.5+ required** (24 recommended) for `node:sqlite`. Older Node crashes
  at startup with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`.
- After a Node upgrade, **`pm2 kill`** then restart — the PM2 daemon caches the
  old Node binary otherwise.
- An `ExperimentalWarning: SQLite ...` at startup is normal, not an error.
- `server/data/` (DB + sessions) and `.env` are gitignored. Back up
  `server/data/` for user data.
- Adding an OAuth scope means existing users must log in again to grant it.
- `passport-discord` is unmaintained but works for `identify` + guild roles.

## Conventions

- Match the surrounding style: functional React components, hooks, plain JSX.
- Keep content/config in `src/data/servers.js`, styles in `src/index.css`.
- Keep all persistence behind `server/store.js`.
- User-facing copy is in **English**.

See `ROADMAP.md` for planned features.
