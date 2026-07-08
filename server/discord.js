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
