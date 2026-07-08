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

---

## 📰 Content & engagement — ✅ done

- ~~News / patch notes~~ ✅ — admins post/edit/delete; public reads.
- ~~Events calendar~~ ✅ — upcoming/past split; admin add/edit/delete.
- ~~Suggestion box / voting~~ ✅ — members post + upvote; admins moderate status.
- ~~Server detail pages~~ ✅ — rules/rates/wipe/mods in a modal per server.
- **Live player graph** (M ⭐) — still open: store BattleMetrics history and chart it.

## 🎮 Servers & game data

- **Player count graph** (M) — store BattleMetrics snapshots over time and chart
  the last 24h / 7d per server. ⭐ (needs the DB to store history)
- **Playtime / points leaderboard** (L ⭐) — a *real* leaderboard ranked by time
  played or points, instead of join order. Biggest payoff from having SQLite.
- **Live Discord widget** (S) — show who's online in Discord right now.
- **"Server is full / online" badges** surfaced higher on the page (S).

## 👥 Community & members

- **Richer profiles** (M ⭐) — bio, favourite server, playtime, badges.
- **Member search & filters** (S ⭐) — search the roster by name/role as it grows.
- **Public profile pages** (M) — shareable `/u/username` pages.
- **Achievements / badges** (M ⭐) — founding member, veteran, event winner, etc.

## 🛠️ Admin & operations

- **Extended admin panel** (M ⭐) — ban list, member notes, activity log.
- **Audit log** (S ⭐) — record role changes and admin actions.
- **Announcement banner** (S) — a dismissible site-wide notice for wipes/downtime.

## 💜 Support the community (optional)

- **Donations / VIP** (M) — Ko-fi / PayPal / Stripe link, optional perks.
- **Supporter badge** (S ⭐) — highlight people who donate.

## ✨ Polish & infra

- **SEO & social preview** (S) — Open Graph image/tags so links look good in
  Discord/Twitter.
- **Automated DB backups** (S) — nightly copy of `server/data/` off the VM.
- **Security review** (S) — quick pass before wider launch / heavier traffic.
- **Switch `passport-discord`** (S) — it's unmaintained; move to a maintained
  Discord strategy at some point.
- **Analytics** (S) — self-hosted (e.g. Umami) to see traffic without trackers.

---

### Suggested next steps

1. **News/patch notes** — highest engagement for the effort, and the first
   feature that really uses your admin role.
2. **Player count graph** or **playtime leaderboard** — shows off the live data
   and gives members a reason to come back.
3. **Member search + richer profiles** — nice as the community grows.
