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
- **Live Discord widget** (S) — show who's online in Discord right now.
- **"Server is full / online" badges** surfaced higher on the page (S).

## 👥 Community & members

- ~~Richer profiles~~ ✅ — bio + favourite server, editable on your profile.
- ~~Member search & filters~~ ✅ — search the roster by name + filter by role.
- **Public profile pages** (M) — shareable `/u/username` pages.
- **Achievements / badges** (M ⭐) — founding member, veteran, event winner, etc.

## 🛠️ Admin & operations

- ~~Announcement banner~~ ✅ — dismissible site-wide notice (info/warning/critical).
- **Extended admin panel** (M ⭐) — ban list, member notes, activity log.
- **Audit log** (S ⭐) — record role changes and admin actions.

## 💜 Support the community (optional)

- **Donations / VIP** (M) — Ko-fi / PayPal / Stripe link, optional perks.
- **Supporter badge** (S ⭐) — highlight people who donate.

## ✨ Polish & infra

- ~~SEO & social preview~~ ✅ — Open Graph/Twitter tags + generated card image.
- ~~Automated DB backups~~ ✅ — `npm run backup` (VACUUM INTO); schedule via cron.
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
