# Game Community Website

A single-page site for our gaming community, built with **React + Vite**. It shows
our servers (CS 1.6, V Rising PvE, V Rising Duo PvP) with live-style player counts
and links to join.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into /dist
npm run preview  # preview the production build locally
```

## Editing content

Almost everything you'll want to change lives in **`src/data/servers.js`**:

- Server names, taglines, game modes, tags, and accent colours
- Real **IP addresses** and the `connect` / `steam://` links
- Your **Discord** invite and community name
- Live-status IDs (`battlemetricsId` for V Rising, `query` for CS 1.6)

Swap the banner images in **`public/servers/`** for your own screenshots
(any 16:9 image works — keep the same filenames or update the `image` paths).

## Live server status

Right now the player counts are **mock data** so the UI works immediately. To show
real numbers, edit **`src/services/serverStatus.js`** — it has a single function,
`fetchServerStatus(server)`, and inline examples for:

1. **BattleMetrics** (easiest for V Rising) — just fill in each server's
   `battlemetricsId` and uncomment the example call.
2. **A tiny backend** for CS 1.6 — browsers can't send the UDP query a Source
   server needs, so run something like the [`gamedig`](https://github.com/gamedig/node-gamedig)
   package on a small Node server and fetch its JSON here.

Nothing else needs to change: every component reads the same status shape
(`{ state, players, maxPlayers, map }`).

## Login & registration (Discord + Steam)

The site has OAuth login: players sign in with **Discord** or **Steam**, and an
account is created automatically on their first login. This needs the small
Express backend in [`server/`](server/) running alongside Vite.

### 1. Run both servers together

```bash
npm run dev:all      # runs Vite (frontend) + the auth backend together
# or run them in two terminals:
#   npm run dev
#   npm run server
```

Frontend: http://localhost:5173 · Backend: http://localhost:3001 (Vite proxies
`/auth` and `/api` to it, so everything is same-origin).

### 2. Add credentials

Copy `.env.example` to `.env` and fill it in. Each provider only turns on once
its credentials are present — until then its button is disabled.

**Discord**
1. Go to <https://discord.com/developers/applications> → *New Application*.
2. Open **OAuth2** → copy the **Client ID** and **Client Secret** into `.env`.
3. Under **OAuth2 → Redirects**, add exactly:
   `http://localhost:5173/auth/discord/callback`

**Steam**
1. Get a Web API key at <https://steamcommunity.com/dev/apikey> (use `localhost`
   as the domain).
2. Put it in `STEAM_API_KEY` in `.env`.

Restart the backend after editing `.env`.

### Profiles & admin roles

- Click your name in the navbar to open your **profile** (avatar, provider,
  role, member since, last login).
- Every account has a **role**: `member` or `admin`. The **first person to log
  in becomes an admin automatically**; you can also pin admins via `ADMIN_IDS`
  in `.env`.
- Admins get a **Members** tab in the profile modal to see everyone and
  promote/demote them. Admin API routes (`/api/admin/*`) are server-side
  protected — non-admins get 403.
- When logged in, the hero greets you by name ("Welcome back, …").

### Discord role sync (optional)

Members' roles from your Discord server can be shown on the site, and a Discord
role can auto-grant site admin. To turn it on, add to `.env`:

- `DISCORD_GUILD_ID` — your server ID (enable Developer Mode → right-click
  server → Copy Server ID).
- `DISCORD_ADMIN_ROLE_IDS` — comma-separated role IDs that grant **site admin**
  (right-click a role → Copy Role ID). Optional.
- `DISCORD_BOT_TOKEN` — optional; only needed to display role **names/colours**
  (otherwise roles are still used for admin mapping, just not shown as tags).
  Create a bot under your app → *Bot*, invite it to the server.

Role sync uses the `guilds.members.read` scope, so **existing users must log in
again once** to grant it. Losing a Discord admin role does not auto-demote (so
the bootstrap admin can't be locked out) — remove admins in the Members panel.

### Public members roster

The **Members** section lists everyone who has signed in, oldest first (a simple
"founding members" leaderboard), with their site role and synced Discord role
tags. It's public and served from `GET /api/members`, which only exposes safe
fields (a hashed key, not the raw Discord/Steam id).

### How it works / where things live

- `server/index.js` — routes: `/auth/discord`, `/auth/steam`, their callbacks,
  `/api/me` (current user), `/api/config` (which providers are on), `/auth/logout`.
- `server/auth.js` — Passport strategies (only registered if credentials exist).
- `server/store.js` — accounts stored in a SQLite database at
  `server/data/users.db` (via Node's built-in `node:sqlite`, no native modules).
  All storage is isolated here, so you could swap to Postgres without touching
  the routes. Auto-migrates from a legacy `users.json` on first run.
- `src/auth/AuthContext.jsx` — React context exposing `user`, `logout`, etc.
- `src/components/LoginModal.jsx` — the Discord/Steam buttons.

> Note: `passport-discord` is unmaintained but still works for `identify` login.
> If you'd rather, it can be swapped for a maintained strategy later.

## Deploying (going live)

Because of the login backend, this deploys as **one Node app** that serves both
the built frontend and the API on a single origin (so cookies work, no CORS).
In production the code already: serves `dist/`, sets `secure` cookies, trusts
the host's HTTPS proxy, and persists sessions to disk.

### Steps

1. **Point your domain** (e.g. `execute-gaming.se`) at a Node host — Railway,
   Render, Fly.io, or a VPS. The host provides HTTPS.
2. **Set environment variables** on the host (same as `.env`), plus:
   ```
   NODE_ENV=production
   PUBLIC_BASE_URL=https://execute-gaming.se
   ```
   Use a strong `SESSION_SECRET`.
3. **Build & start** (most hosts run these automatically):
   ```
   npm install && npm run build
   npm start
   ```
4. **Register the production redirect** in Discord → OAuth2 → Redirects:
   ```
   https://execute-gaming.se/auth/discord/callback
   ```
   Keep the localhost one for local dev. Steam needs no registration (it uses
   `PUBLIC_BASE_URL` automatically).
5. Pick one canonical domain (with or without `www`) and make `PUBLIC_BASE_URL`,
   the Discord redirect, and the served domain all match exactly.

### Updating later

Use the included script — it pulls (if git), installs, builds, and reloads PM2:

```bash
chmod +x deploy.sh   # once
./deploy.sh          # every update
```

> Persistence: accounts live in `server/data/users.db` (SQLite) and sessions in
> `server/data/sessions`. Make sure that directory is on a **persistent disk**
> (some hosts have ephemeral filesystems that reset on deploy). For heavier use,
> swap `store.js` for SQLite/Postgres.
