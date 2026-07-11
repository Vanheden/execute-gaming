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
- **Guest player profiles** — unregistered players on the leaderboard are now
  clickable too, linking to `/p/:steamId` game-stats pages showing rank, playtime,
  kills, per-server breakdown and an activity heatmap. A "Guest" badge distinguishes
  them from registered members; if they later register, a link to their full profile
  appears.
- **Leaderboard medals** — top-3 rows get gold/silver/bronze emoji medals (🥇🥈🥉)
  with tinted row backgrounds.
- **Game-stat auto-achievements** — 9 badges auto-granted from playtime/kill data:
  Blood Initiate (1st V Blood), V Blood Hunter (10), V Blood Slayer (25), PvP
  Contender (10 kills), PvP Duelist (50), Dedicated (100h), No Life (500h), Rising
  Star (1000 pts), Legend (5000 pts). Computed on the fly via `getPlayerTotals` /
  `getPlayerTotalsBatch` — no storage needed.
- **Live kill feed** — a horizontally-laid-out pill feed on the leaderboard page
  showing recent V Blood/PvP kills ("Roddan killed Alpha the White Wolf · 2m ago"),
  auto-refreshing every 30s. Follows the leaderboard's server filter.
- **Season Champions** — a hall-of-fame panel on the leaderboard showing the top-1
  player for each completed season (between resets) per server, with points and
  season date range. Backed by `getSeasonChampions()` in `playtime.js`.
- **V Blood Hunt Tracker** (`/hunt`) — a dedicated page showing each player's boss
  kill progress as a 64-cell matrix (🩸 for killed, ○ for missing) with progress
  bars, player search and server filter. Backed by `getVBloodHuntProgress()`.
- **Activity heatmap** — GitHub-style contributions graph showing daily playtime
  for the last year with 5 intensity levels. Shown on both `/p/:steamId` (guest)
  and `/u/:key` (member) profile pages. Backed by `getPlayerActivity()`.
- **Season reset admin panel** — non-destructive leaderboard season wipes with a
  rolling one-step backup (`previous` cutoff). Admin can reset, restore previous,
  or clear a reset per server. Standalone `/admin` route with `useAuth()` access
  control.
- **Community milestones** — a stat strip atop the leaderboard: total hours played,
  V Bloods felled, PvP kills and vampires tracked, plus the **hottest PvP feud**
  ("X has slain Y 3×"). Backed by `getGlobalStats()` + `getHottestFeud()`.
- **Rivalries / Nemesis** — each profile shows the player's **Nemesis** (who killed
  them most, with a head-to-head record) and **Favourite prey** (who they killed
  most), derived from PvP `kill_events`. Backed by `getRivalries()`; shown on both
  `/p/:steamId` (guest) and `/u/:key` (member) profiles.
- **Play streaks** — consecutive-day play streaks (current + longest) shown on
  profiles and a "longest active streaks" list in the milestones strip. Backed by
  `getPlayerStreak()` / `getTopStreaks()`.
- **Clans** (L) — a whole team dimension on top of the per-player stats. The mod
  (v0.3.0) captures each player's clan (stable `ClanGuid` + name, from
  `User.ClanEntity` → `ClanTeam`) and sends it on every session + kill, plus the
  victim's clan on PvP kills. The site gets a **clan leaderboard** (`/clans`, same
  metric/server/period filters, keyed by `ClanGuid` and shown under the latest name),
  **clan profiles** (`/c/:guid` — totals, distinct bosses, member roster, and a
  **clan-vs-clan war record** "Clan A 5–2 Clan B" with win/loss colouring), and the
  **hottest clan war** on the milestones strip. Clan attribution is denormalised at
  event time, so clan stats recompute from raw rows with the same points weighting —
  no membership table. Backed by `getClanLeaderboard()` / `getClanStats()` /
  `getClanWars()` / `getHottestClanWar()` in `server/playtime.js`.
- **Castle raid tracking** (L) — the standout of the clan feature: the mod (v0.4.0)
  hooks `CastleHeartEventSystem.ProcessRaidEvent` and reports each castle raid — the
  **attacker** (raider, from `FromCharacter`) and the **defender** (the raided heart's
  owner, via `UserOwner`/`CastleHeart.LastUserOwner`), each resolved to a clan. The site
  gets a **raid feed** on `/clans` ("Clan A ⚔️ raided Clan B · 2h ago",
  `components/RaidFeed.jsx`), a **raid record** on each clan profile (raids landed vs
  suffered + a per-rival breakdown), and a **"most feared raiders"** line on the
  milestones strip. Backed by `recordRaid()` / `getRaidFeed()` / `getClanRaidRecord()` /
  `getTopRaiderClan()` + a `raid_events` table. Either side's identity may be partial (a
  clanless solo raider), and the raid attribution is denormalised at event time like the
  rest. The mod hook is **built + compile-verified but pending live verification** (raids
  are rare — like the kill hooks before v0.2.2; the mod logs `→ Raid:` for the first one).
- **Season recap card** (M) — a shareable "V Rising Wrapped" card on every player
  profile (`/p/:steamId` + `/u/:key`). A single self-contained `<svg>` (no external
  images/fonts, so it rasterises cleanly) with the player's playtime, kills, raids,
  points, global rank/percentile, top nemesis and a computed **archetype** (Castle
  Breaker / Bloodletter / V Blood Hunter / Nightwalker). "Download card" exports a PNG
  (SVG → canvas) to drop in Discord; "Copy link" shares the profile. Backed by
  `getPlayerRecap()` + `GET /api/player/:steamId/recap` (`components/SeasonRecap.jsx`).
- **PvP rating (Elo) + PvP hub** (M) — every PvP kill is a 1v1 match that shifts both
  fighters' Elo (start 1000, K=32, <3 duels = provisional), replayed chronologically and
  memoised. A dedicated **PvP Arena** page (`/pvp`) gathers it all: the rating ladder,
  a top-PvP-killers board, a PvP-only live kill feed (`kind=pvp`) and the fiercest
  rivalry. Ratings also show on player profiles. Backed by `getPvpLeaderboard()` /
  `getPvpRating()` + `GET /api/pvp/leaderboard` (`components/Pvp.jsx`, `PvpLadder.jsx`).
- **Leaderboard pagination** — the ladder shows 20 players per page with Prev/Next
  controls; rank numbers and medals stay global across pages. (Also fixed the top-3
  medal emoji rendering as tofu — `'🥇🥈🥉'[i]` split a surrogate pair.)
- **Vampire theme** — a Cinzel gothic display font + blood-red / poison-green
  palettes give the leaderboard panels a gothic V Rising look: Milestones + Rivalries
  in blood-red (crimson glow, blood-moon vignette, glowing stat numbers), Weekly
  Highlights in poison-green. Tokens live in `src/index.css` `:root`.
- **Admin panel toggles** — admins can show/hide the Milestones, Weekly Highlights
  and Season Champions panels from `/admin` → Settings (generic feature flags,
  default ON, audit-logged), alongside the existing Live Kill Feed toggle.
- **Discord announcements webhook** — news, events, the announcement banner,
  player **rank-ups**, **suggestion** updates (planned/shipped), **season resets**
  and **community milestones** are posted to a Discord channel as rich embeds via
  an incoming webhook (`DISCORD_WEBHOOK_URL`, no bot needed). Fail-open: unset/broken
  webhook posts nothing and never affects the request. The bot posts under the name
  "Execute-Gaming" with a generated bat avatar (`npm run bot-avatar`). Rank-ups and
  milestones are seeded silently (a new `player_ranks` table + `milestone_*` settings)
  so enabling it never spams past events. Admins can **mute each category** and fire a
  **test post** from `/admin` → Settings.
- **Server-side status proxy** — live V Rising server status is now fetched from
  BattleMetrics **server-side** (`GET /api/servers/:id/status`, 30s cache) instead of
  from the browser, so a visitor's VPN/adblock/CORS can no longer blank the card.
- **Motion & finish pass** — shimmer **skeleton loaders** for the leaderboard list +
  community-milestones strip (no more bare "Loading…" text), **count-up** animation on
  the milestone numbers when they scroll into view, **scroll-reveal** fades for the home
  sections, and micro-interactions (leaderboard bars grow on paint, rank pills glow on
  hover, the gold champion medal shines). All honour `prefers-reduced-motion`. Shared
  primitives: `hooks/useInView.js`, `components/Reveal.jsx`, `.sk`/`.reveal` in CSS.

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
- ~~**Clan leaderboard & clan-vs-clan wars**~~ (L) ✅ — `/clans` ladder + `/c/:guid`
  clan profiles with roster and a head-to-head war record; the mod (v0.3.0) captures
  the clan (`ClanGuid` + name) on sessions/kills and the victim clan on PvP kills.
  Keyed by the rename-proof `ClanGuid`, denormalised at event time. See
  `getClanLeaderboard()` / `getClanStats()` / `getClanWars()` in `server/playtime.js`.
- ~~**Castle raid tracking**~~ (L) ✅ — raid feed on `/clans` + per-clan raid record +
  "most feared raiders" milestone; the mod (v0.4.0) hooks
  `CastleHeartEventSystem.ProcessRaidEvent` and reports attacker + defender clans per
  raid (`raid_events` table, `getRaidFeed()` / `getClanRaidRecord()` /
  `getTopRaiderClan()`). Mod hook pending live verification (raids are rare).
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
- ~~Achievements / badges~~ ✅ — auto (founder/veteran/staff + 9 game-stat badges)
  + admin-granted (event champion, bug hunter, supporter, …). Catalog in
  `src/data/achievements.js`. Stat-based badges computed via `getPlayerTotals`.

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
- ~~**Proxy live server status through the backend**~~ ✅ — `GET /api/servers/:id/status`
  fetches BattleMetrics server-side (30s cache, `getLiveStatus` in `server/stats.js`);
  `serverStatus.js` now calls that same-origin proxy, so a visitor's VPN/adblock/CORS
  no longer blanks the card.

---

### Suggested next steps

Most of the roadmap is now built. What's left:

1. **Clan tag on player rows** (S) — show each player's clan as a small tag beside
   their name on the main `/leaderboard` (needs `getLeaderboard` to return the
   player's latest clan — a subquery like `lastVBlood`). Deferred from the clan build.
2. **Clan achievements / clan season champions** (M) — reuse the badge + season-champion
   machinery at the clan level (e.g. "first clan to fell every V Blood", reigning clan).
3. **Donations / VIP** (M) — optional; the `supporter` badge is already there.
4. **Scheduled weekly recap** (M) — a cron-posted Discord digest (top 3, most active,
   hottest feud + hottest clan war), building on the announcements webhook +
   `getGlobalStats`/`getTopStreaks`/`getHottestClanWar`.

Recently shipped: **season recap card** — a shareable "V Rising Wrapped" SVG on every
player profile (playtime/kills/raids/rank/nemesis + a computed archetype) that exports to
PNG for Discord (`getPlayerRecap()`, `components/SeasonRecap.jsx`). **PvP rating + hub** —
an Elo skill rating from every duel, surfaced on a dedicated `/pvp` page (rating ladder,
top killers, PvP-only kill feed, fiercest rivalry) and on player profiles
(`getPvpRating()`/`getPvpLeaderboard()`, `components/Pvp.jsx`). **castle raids** — a raid feed on `/clans`, a per-clan raid record
(raids landed vs suffered) and a "most feared raiders" milestone; the mod (v0.4.0)
hooks `CastleHeartEventSystem.ProcessRaidEvent` and reports attacker + defender clans
per raid (pending live verification). **clans** — clan leaderboard (`/clans`), clan
profiles (`/c/:guid`) with roster + clan-vs-clan war record, hottest clan war on the
milestones strip; the mod (v0.3.0) captures the clan (`ClanGuid` + name) on
sessions/kills + victim clan on PvP kills. **per-server home tag + playtime split** — each leaderboard row
(in the "All servers" view) shows the server that player has logged the most time on,
as an accent-tinted tag beside their points value (`topServers()` in
`server/playtime.js` → `entry.homeServer`); both profile pages gain a stacked-bar
"By server" playtime split (e.g. "Easy PvE 60% · Duo PvP 40%") via the reusable
`components/ServerSplit.jsx` + `serverPlaytime()` helper; **Reigning Champion card**
(`components/ChampionCard.jsx`) — a hero
spotlight at the top of `/leaderboard` featuring the reigning all-time Points #1 with a
large avatar, rank pill, key stats (points count-up / playtime / V Bloods / PvP) and a
blood-moon glow; self-contained (fetches the points/all-time ladder itself so it stays
fixed on the true #1 regardless of the tabs), always on, skeleton while loading,
reduced-motion safe; motion & finish pass (skeleton loaders, milestone count-up,
scroll-reveal, micro-interactions — all reduced-motion safe); Discord webhook
expanded (suggestions/season resets/community
milestones + per-category admin mute + test post + bot avatar); server-side
BattleMetrics status proxy (no more client-side VPN/CORS "Unknown"); Discord
announcements webhook (news/events/banner/rank-ups → channel embeds, fail-open);
leaderboard pagination (20/page) + top-3 medal glyph fix;
community milestones strip (global counters + hottest feud); rivalries/nemesis
(head-to-head PvP records on profiles); play streaks (current/longest on profiles
+ a top-streaks list); gothic vampire theme (Cinzel + blood/venom palettes);
admin toggles for the milestones/highlights/champions panels; guest player
profiles (`/p/:steamId`); leaderboard medals;
9 game-stat auto-achievements; live kill feed (horizontal pills, server-filtered);
season champions hall-of-fame; V Blood hunt tracker (`/hunt`); activity heatmap
on both profile types; season reset admin panel with rolling backup; mod v0.2.3
V Blood fix (`!diedIsPlayer` guard for `CHAR_VampireMale`); mod v0.2.4 on-disk
kill queue (survives website outages).
