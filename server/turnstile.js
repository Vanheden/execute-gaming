// ---------------------------------------------------------------------------
// Cloudflare Turnstile — CAPTCHA verification for login + suggestions
// ---------------------------------------------------------------------------
// Enabled only when BOTH TURNSTILE_SECRET_KEY (server) and TURNSTILE_SITE_KEY
// (public, served to the frontend via /api/config) are set. When unset,
// verification is skipped so local dev without keys is unaffected — mirroring how
// the OAuth providers and the Discord webhook degrade gracefully. Requiring both
// keys avoids a lockout where the backend enforces a CAPTCHA the frontend can't
// render. See .env.example for setup.
// ---------------------------------------------------------------------------
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export function turnstileEnabled() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY)
}

export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null

// Verify a widget token with Cloudflare. Returns true when Turnstile is disabled
// (dev) or the token is valid; false otherwise. Never throws — a network blip must
// not 500 the request, it just fails the check.
export async function verifyTurnstile(token, ip) {
  if (!turnstileEnabled()) return true
  if (!token || typeof token !== 'string' || token.length > 2048) return false
  try {
    const form = new URLSearchParams()
    form.append('secret', process.env.TURNSTILE_SECRET_KEY)
    form.append('response', token)
    if (ip) form.append('remoteip', ip)
    const res = await fetch(VERIFY_URL, { method: 'POST', body: form })
    if (!res.ok) return false
    const data = await res.json()
    return data.success === true
  } catch {
    return false
  }
}
