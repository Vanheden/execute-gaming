// ---------------------------------------------------------------------------
// Discord guild helpers
// ---------------------------------------------------------------------------
// Reads the logged-in user's roles in YOUR community server (guild) using the
// OAuth access token (needs the `guilds.members.read` scope + DISCORD_GUILD_ID).
// If you also provide a DISCORD_BOT_TOKEN, we resolve role IDs to names/colors
// so the site can show pretty role tags. Everything degrades gracefully:
// missing config just means no roles are synced.
// ---------------------------------------------------------------------------
const API = 'https://discord.com/api'

// Fetch the member object for the current user in the configured guild.
// Returns an array of role IDs (empty if not a member / not configured).
export async function fetchGuildMemberRoles(accessToken, guildId) {
  if (!guildId) return []
  try {
    const res = await fetch(`${API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data.roles) ? data.roles : []
  } catch {
    return []
  }
}

// --- Live widget -----------------------------------------------------------
// The public guild widget (https://discord.com/api/guilds/:id/widget.json).
// Requires "Enable Server Widget" in Discord → Server Settings → Widget.
// No bot token needed. Cached for 60s to stay well under Discord's rate limits.
let widgetCache = { at: 0, data: null, guildId: null }

export async function fetchWidget(guildId) {
  if (!guildId) return null
  const fresh = Date.now() - widgetCache.at < 60 * 1000 && widgetCache.guildId === guildId
  if (fresh) return widgetCache.data
  try {
    const res = await fetch(`${API}/guilds/${guildId}/widget.json`)
    if (!res.ok) {
      // 403 = widget disabled. Cache the null briefly so we don't hammer it.
      widgetCache = { at: Date.now(), data: null, guildId }
      return null
    }
    const raw = await res.json()
    const members = (raw.members || [])
      .map((m) => ({
        id: m.id,
        username: m.username,
        avatar: m.avatar_url || null,
        status: m.status || 'online',
        game: m.game?.name || null,
      }))
      .slice(0, 30) // Discord caps this at 100; 30 is plenty for the UI.
    const data = {
      name: raw.name || null,
      online: Number(raw.presence_count) || members.length,
      invite: raw.instant_invite || null,
      members,
    }
    widgetCache = { at: Date.now(), data, guildId }
    return data
  } catch {
    return widgetCache.guildId === guildId ? widgetCache.data : null
  }
}

// Cache the guild's role list (id -> {name,color}) for 5 minutes.
let rolesCache = { at: 0, map: null }

async function getGuildRolesMap(guildId, botToken) {
  if (!guildId || !botToken) return null
  const fresh = Date.now() - rolesCache.at < 5 * 60 * 1000
  if (rolesCache.map && fresh) return rolesCache.map
  try {
    const res = await fetch(`${API}/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
    })
    if (!res.ok) return rolesCache.map
    const roles = await res.json()
    const map = {}
    for (const r of roles) {
      map[r.id] = {
        id: r.id,
        name: r.name,
        color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null,
        position: r.position ?? 0,
      }
    }
    rolesCache = { at: Date.now(), map }
    return map
  } catch {
    return rolesCache.map
  }
}

// Turn role IDs into display objects, dropping @everyone (id === guildId).
// Sorted by Discord position (highest role first) when names are available.
export async function resolveRoles(roleIds, guildId, botToken) {
  if (!roleIds?.length) return []
  const map = await getGuildRolesMap(guildId, botToken)
  const resolved = roleIds
    .filter((id) => id !== guildId)
    .map((id) => (map && map[id]) || { id, name: null, color: null, position: 0 })
  resolved.sort((a, b) => (b.position || 0) - (a.position || 0))
  // Only keep the display fields the frontend needs.
  return resolved.map(({ id, name, color }) => ({ id, name, color }))
}

// --- Outbound announcements (incoming webhook) -----------------------------
// Posts rich embeds to a Discord channel via an incoming webhook URL
// (DISCORD_WEBHOOK_URL — Server Settings → Integrations → Webhooks). No bot
// needed. Everything is FAIL-OPEN: a missing URL or a network error just means
// nothing is posted; it never throws and never blocks the request that triggered
// it (callers fire-and-forget these). Links use PUBLIC_BASE_URL so they point at
// the live site in production.
const BRAND = 'Execute-Gaming'
const siteUrl = () => (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')

// Blood-red fallback; matches the site's --blood accent.
function hexToInt(hex) {
  const n = parseInt(String(hex || '').replace('#', ''), 16)
  return Number.isNaN(n) ? 0x8a0f2a : n
}

// Trim text to a Discord-friendly length (embeds allow more, but shorter reads better).
function clip(text, max = 500) {
  const s = String(text ?? '').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

// Render an ISO timestamp as a Discord dynamic timestamp (localised per viewer).
function discordTime(iso) {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? String(iso || '') : `<t:${Math.floor(t / 1000)}:F>`
}

// Low-level POST. Returns true on 2xx, false otherwise — never throws.
export async function postWebhook(payload) {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return false
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: BRAND, ...payload }),
    })
    if (!res.ok) console.warn('[discord] webhook rejected:', res.status)
    return res.ok
  } catch (err) {
    console.warn('[discord] webhook failed:', err?.message || err)
    return false
  }
}

export function announceNews({ title, body }) {
  return postWebhook({
    embeds: [
      {
        author: { name: '📣 News' },
        title: clip(title, 240),
        description: clip(body, 600),
        url: `${siteUrl()}/#news`,
        color: 0xe63950,
        footer: { text: BRAND },
        timestamp: new Date().toISOString(),
      },
    ],
  })
}

export function announceEvent({ title, description, startsAt, location }) {
  const fields = []
  if (startsAt) fields.push({ name: 'When', value: discordTime(startsAt), inline: true })
  if (location) fields.push({ name: 'Where', value: clip(location, 100), inline: true })
  return postWebhook({
    embeds: [
      {
        author: { name: '🗓️ New event' },
        title: clip(title, 240),
        description: description ? clip(description, 600) : undefined,
        url: `${siteUrl()}/events`,
        color: 0x7c4dff,
        fields: fields.length ? fields : undefined,
        footer: { text: BRAND },
        timestamp: new Date().toISOString(),
      },
    ],
  })
}

export function announceAnnouncement({ message, level }) {
  const colors = { info: 0x33c9c9, warning: 0xf5b642, critical: 0xe63950 }
  const labels = { info: '📢 Announcement', warning: '⚠️ Announcement', critical: '🚨 Announcement' }
  return postWebhook({
    embeds: [
      {
        author: { name: labels[level] || labels.info },
        description: clip(message, 600),
        url: siteUrl(),
        color: colors[level] || colors.info,
        footer: { text: BRAND },
        timestamp: new Date().toISOString(),
      },
    ],
  })
}

// `tier` is a RANKS entry ({ name, icon, color }); `profileUrl` deep-links the player.
export function announceRankUp({ name, tier, points, profileUrl }) {
  return postWebhook({
    embeds: [
      {
        author: { name: '🩸 Rank up' },
        title: `${tier.icon} ${clip(name, 80)} ascended to ${tier.name}`,
        description: `A vampire climbs the ladder with **${Number(points).toLocaleString()}** points.`,
        url: profileUrl || `${siteUrl()}/leaderboard`,
        color: hexToInt(tier.color),
        footer: { text: BRAND },
        timestamp: new Date().toISOString(),
      },
    ],
  })
}
