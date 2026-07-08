# Security notes

A quick review of the Execute-Gaming site's security posture and the measures
in place. This is a small community site, not a bank — the goal is sensible
defaults with no heavy dependencies, matching the project's "no native modules,
minimal deps" ethos.

## What's in place

### Transport & cookies
- **HTTPS** is terminated by Caddy in production; `trust proxy` is set so Express
  sees the real protocol/IP.
- Session cookies are `httpOnly`, `sameSite=lax`, and `secure` in production
  (see `server/index.js`). The signing secret comes from `SESSION_SECRET`.

### HTTP headers
Set on every response (`server/index.js`), no dependency needed:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`

Caddy adds HSTS. (A full Content-Security-Policy is a good future addition; the
current build inlines nothing risky and loads no third-party scripts.)

### Rate limiting
A dependency-free, in-memory per-IP sliding window on **mutating** requests
(POST/PUT/PATCH/DELETE): `RATE_MAX` per `RATE_WINDOW_MS` (default 60/minute).
Blunts brute-force and spam without a shared store; resets on restart, which is
fine at this scale. GETs are unaffected.

### Input handling
- JSON body cap of 64 kB (`express.json({ limit })`).
- Every string field is trimmed and length-checked (`str()` helper) before it
  touches the database.
- **All DB access uses parameterised statements** (`node:sqlite` prepared
  statements) — no string-concatenated SQL, so no SQL injection.
- React escapes all rendered values by default; no `dangerouslySetInnerHTML`.

### AuthZ
- `ensureAuth` / `ensureAdmin` guard every protected route.
- The public roster and profile endpoints expose only safe fields and a **hashed
  key** (`sha1(id)[:12]`), never the raw Discord/Steam id.
- Private admin notes and ban reasons are only ever returned from admin-only
  endpoints, never from `/api/me`, `/api/members`, or `/api/profile/:key`.
- Admins can't ban themselves (avoids self-lockout); the bootstrap rule prevents
  ending up with zero admins.

### Bans & audit
- Banned members are hidden from the roster and **logged straight out on their
  next login** (`finishLogin` → `/?login=banned`).
- Every admin action (role change, ban/unban, note edit, badge grant/revoke,
  announcement change) is written to an **audit log** with actor, target and
  timestamp, viewable in the admin panel.

### Privacy
- Self-hosted analytics store **aggregate per-day, per-path counts only** — no
  cookies, no IP addresses, no fingerprints, no third-party requests. The
  public-profile key is collapsed to `/u/:key` so no per-member rows are kept.

## Known limitations / future work
- **No CSP yet** — worth adding a strict `Content-Security-Policy` once we're
  sure nothing inline is needed.
- **Rate limiter is in-memory** — per-process and resets on restart. Fine for a
  single PM2 instance; would need a shared store if scaled horizontally.
- **`passport-oauth2` state** — CSRF protection on the OAuth flow relies on the
  session store being available during the round-trip (it is, via
  `session-file-store`).
- Dependencies should be checked periodically with `npm audit`.

## Reporting
Found something? Message an admin on the [Discord](https://discord.gg/r29Tpc95fS)
rather than opening a public issue.
