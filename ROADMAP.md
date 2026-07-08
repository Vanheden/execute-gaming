# Execute-Gaming — Roadmap & Ideas

Ideas for growing the site, grouped by theme. Effort is a rough guide:
**S** = an hour or two · **M** = an afternoon · **L** = a bigger build.
⭐ = made easier now that we're on a real SQLite database.

## ✅ Done so far

- React + Vite site, colourful theme, custom logo, vampire server banners
- Live V Rising server status (BattleMetrics) — PvE + Duo PvP
- Discord & Steam login (accounts created on first login)
- Roles & admin panel (promote/demote members)
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

---

## 📰 Content & engagement — ✅ done

- ~~News / patch notes~~ ✅ — admins post/edit/delete; public reads.
- ~~Events calendar~~ ✅ — upcoming/past split; admin add/edit/delete.
- ~~Suggestion box / voting~~ ✅ — members post + upvote; admins moderate status.
- ~~Server detail pages~~ ✅ — rules/rates/wipe/mods inline under each server card.
- ~~Live player graph~~ ✅ — BattleMetrics history stored + charted (24h / 7d).

## 🎮 Servers & game data

- **Playtime / points leaderboard** (L ⭐) — a *real* leaderboard ranked by time
  played or points, instead of join order. Biggest payoff from having SQLite.
- ~~Live Discord widget~~ ✅ — shows who's online in Discord (needs the guild
  widget enabled in Discord → Server Settings → Widget).
- **"Server is full / online" badges** surfaced higher on the page (S).

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

---

### Suggested next steps

Most of the roadmap is now built. What's left:

1. **Playtime / points leaderboard** (L) — the big remaining feature; a real
   ranked ladder from tracked play data. Best payoff for member retention.
2. **"Server full / online" badges** higher on the page (S) — quick polish.
3. **Donations / VIP** (M) — optional; the `supporter` badge is already there.
