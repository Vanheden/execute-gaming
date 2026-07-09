# Execute-Gaming — Roadmap & Ideas

Ideas for growing the site, grouped by theme. Effort is a rough guide:
**S** = an hour or two · **M** = an afternoon · **L** = a bigger build.
⭐ = made easier now that we're on a real SQLite database.

## ✅ Done so far

- React + Vite site, colourful theme, custom logo, vampire server banners
- Live V Rising server status (BattleMetrics) — PvE + Duo PvP
- Discord & Steam login (accounts created on first login)
- Env-driven admin roles + admin panel (no in-app promote/demote)
- Public members roster with synced Discord roles (names + colours)
- SQLite backend, deployed on Proxmox via PM2 + Caddy at execute-gaming.se
- **News / patch notes** — admin-authored posts
- **Events calendar** — upcoming + past events, admin-managed
- **Suggestion box** — members post ideas, upvote, admins set status
- **Server detail pages** — per-server rules, rates, wipe, mods, connect info
  (always-visible inline under each server card)
- **Live player-count graph** — BattleMetrics history stored + charted (24h / 7d)
- **Announcement banner** — admin-set, dismissible site-wide notice
- **Richer profiles + member search** — bio/favourite server, roster search & filter
- **SEO & social preview** — Open Graph/Twitter tags + generated card image
- **Automated DB backups** — `npm run backup` (VACUUM INTO) + cron
- **Live Discord widget** — who's online in Discord right now (guild widget API)
- **Public profile pages** — shareable `/u/:key` pages with badges
- **Achievements / badges** — auto (founder/veteran/staff) + admin-granted
- **Extended admin panel** — ban list, private member notes, per-member badges
- **Audit log** — every admin action recorded and browsable
- **Self-hosted analytics** — privacy-friendly page-view counts, no third parties
- **Security hardening** — headers, write rate-limiting, banned-login block
- **Dedicated pages** — Events, Members, Achievements & Suggestions each on their
  own route (`/events`, `/members`, …) instead of one long scrolling home page
- **Styled dialogs** — custom confirm/prompt modals replace native browser popups
- **Atmospheric hero** — self-drawn V Rising scene (blood moon, castle, embers)
- **Playtime + points leaderboard** — playtime, V Blood & PvP kills and a combined
  points ranking, fed by our in-game BepInEx mod (`mod/`). Deployed live; the mod's
  V Blood + PvP kill hooks are **verified live** (death-based detection, mod v0.2.2).
  Metric tabs (Points / Playtime / V Blood / PvP) with themed colours — green V Blood,
  red PvP, white numbers, a lightened accent for the h/m playtime units, and a
  bat-in-blood-moon placeholder avatar. Each row also shows the player's **latest
  V Blood** felled ("🩸 Latest Kill: Alpha Wolf"), resolved from a boss PrefabGUID→name map.
- **Link Steam + Discord** — one account can own both identities (link from the
  profile); logins resolve to the primary and the leaderboard attributes a linked
  SteamID to the member. Any pre-existing duplicate account is merged in.
- **Player ranks** — an 8-tier "Vampire Ascension" ladder (Fledgling → Rogue →
  Nightborne → Bloodletter → Dread Knight → Elder → Nightlord → Dracula) derived
  from each player's **all-time points**. Shows as a coloured rank pill on every
  leaderboard row and as a progress badge (with "N pts to next rank") on public
  `/u/:key` profiles. Thresholds/names/colours live in one file (`src/data/ranks.js`).
  Ranks are **per server as well as global**: the leaderboard pill follows the active
  server filter (global on "All servers"), and each profile shows the global rank plus
  a per-server breakdown. V Blood scoring rewards **variety**: the first kill of a boss
  is worth 50 pts, each repeat of the same boss 25 — so farming one easy boss no longer
  out-scores clearing new content.

---

## 📰 Content & engagement — ✅ done

- ~~News / patch notes~~ ✅ — admins post/edit/delete; public reads.
- ~~Events calendar~~ ✅ — upcoming/past split; admin add/edit/delete.
- ~~Suggestion box / voting~~ ✅ — members post + upvote; admins moderate status.
- ~~Server detail pages~~ ✅ — rules/rates/wipe/mods inline under each server card.
- ~~Live player graph~~ ✅ — BattleMetrics history stored + charted (24h / 7d).

## 🎮 Servers & game data

- ~~**Playtime + points leaderboard**~~ (L ⭐) ✅ — `play_sessions` + `kill_events`
  tables, secret-guarded ingest (`POST /api/ingest/session` + `/api/ingest/kill`),
  a public `GET /api/leaderboard?metric=points|playtime|vblood|pvp` (per-server +
  time-window filters, linked to member profiles), and a `/leaderboard` page with
  metric tabs. Fed by the in-game BepInEx mod (`mod/`), which reports playtime,
  V Blood boss kills and PvP kills. Points = weighted blend (playtime + V Bloods +
  PvP), tunable in `server/playtime.js`. The mod's kill hooks are **verified live**
  (death-based detection, mod v0.2.2 — see mod CLAUDE.md).
- ~~Live Discord widget~~ ✅ — shows who's online in Discord (needs the guild
  widget enabled in Discord → Server Settings → Widget).
- ~~**"Server is full / online" badges**~~ ✅ — a live status strip at the top of the
  Servers section shows each server's Online/Full/Offline state + player count at a
  glance (no scrolling to each card); chips deep-link to the card. Cards also show a
  "Full" pill when at capacity.

## 👥 Community & members

- ~~Richer profiles~~ ✅ — bio + favourite server, editable on your profile.
- ~~Member search & filters~~ ✅ — search the roster by name + filter by role.
- ~~Public profile pages~~ ✅ — shareable `/u/:key` pages (badges, roles, bio).
- ~~Achievements / badges~~ ✅ — auto (founder/veteran/staff) + admin-granted
  (event champion, bug hunter, supporter, …). Catalog in `src/data/achievements.js`.

## 🛠️ Admin & operations

- ~~Announcement banner~~ ✅ — dismissible site-wide notice (info/warning/critical).
- ~~Extended admin panel~~ ✅ — ban list, private member notes, badge granting,
  all inside the profile → Members tab.
- ~~Audit log~~ ✅ — every admin action recorded, browsable in the admin panel.

## 💜 Support the community (optional)

- **Donations / VIP** (M) — Ko-fi / PayPal / Stripe link, optional perks.
- **Supporter badge** (S ⭐) — highlight people who donate. *(A `supporter`
  achievement already exists — just grant it.)*

## ✨ Polish & infra

- ~~SEO & social preview~~ ✅ — Open Graph/Twitter tags + generated card image.
- ~~Automated DB backups~~ ✅ — `npm run backup` (VACUUM INTO); schedule via cron.
- ~~One `.env` for dev & prod~~ ✅ — dev auto-uses localhost for OAuth; the
  `PUBLIC_BASE_URL` in `.env` only applies when `NODE_ENV=production`.
- ~~Security review~~ ✅ — security headers, write rate-limiting, request size
  cap, banned-login block. See `SECURITY.md`.
- ~~Switch `passport-discord`~~ ✅ — replaced with the maintained `passport-oauth2`
  (custom Discord profile fetch); behaviour unchanged.
- ~~Analytics~~ ✅ — self-hosted, privacy-friendly page-view counts (no cookies,
  no PII, no third parties) in the admin panel.
- **Proxy live server status through the backend** (S) — today `serverStatus.js`
  calls BattleMetrics **from the browser**, so a visitor's VPN/adblock/firewall
  blocking `api.battlemetrics.com` makes the card show "Unknown". Move the call
  server-side (fetch + short cache, expose `GET /api/servers/:id/status`) so every
  visitor sees the count regardless of their network, and CORS stops mattering.

---

### Suggested next steps

Most of the roadmap is now built. What's left:

1. **Proxy BattleMetrics status server-side** (S) — kills the client-side
   VPN/CORS "Unknown" (see Polish & infra).
2. **Donations / VIP** (M) — optional; the `supporter` badge is already there.

Recently shipped: **player ranks** — an all-time points "Vampire Ascension"
ladder shown as a rank pill on the leaderboard and a progress badge on profiles
(`src/data/ranks.js`), plus variety-rewarding V Blood scoring (first kill of a
boss 50 pts, repeats 25); the leaderboard mod's V Blood + PvP kill hooks are
**verified live** (death-based detection, mod v0.2.2); Steam + Discord account
linking; leaderboard metric colours / bat avatar polish; the "Latest Kill"
line showing each player's most recent V Blood boss (all 64 bosses named via
`src/data/vbloods.js`, from the official wiki's V Blood Unit IDs table); and a
live server status strip (Online / Full / Offline at a glance) atop the Servers
section.
