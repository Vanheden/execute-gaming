// ---------------------------------------------------------------------------
// Passport strategy configuration for Discord + Steam
// ---------------------------------------------------------------------------
// A provider is only enabled if its credentials are present in .env, so the
// server boots fine even before you've set them up. The frontend asks
// /api/config which providers are enabled and disables the buttons otherwise.
// ---------------------------------------------------------------------------
import discordPkg from 'passport-discord'
import steamPkg from 'passport-steam'
import { upsertUser } from './store.js'
import { fetchGuildMemberRoles, resolveRoles } from './discord.js'

const DiscordStrategy = discordPkg.Strategy || discordPkg
const SteamStrategy = steamPkg.Strategy || steamPkg

// Public URL the browser uses for OAuth callbacks. In dev we always use the
// local Vite server (via its proxy) so a production PUBLIC_BASE_URL in .env
// doesn't send the OAuth round-trip to the live domain while developing.
const isProd = process.env.NODE_ENV === 'production'
const BASE = isProd ? process.env.PUBLIC_BASE_URL || 'http://localhost:5173' : 'http://localhost:5173'

export const enabledProviders = {
  discord: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
  steam: Boolean(process.env.STEAM_API_KEY),
}

export function configureAuth(passport) {
  passport.serializeUser((user, done) => done(null, user.id))
  passport.deserializeUser((id, done) => {
    // getUserById is cheap (small JSON file); import lazily to avoid a cycle.
    import('./store.js').then(({ getUserById }) => done(null, getUserById(id)))
  })

  if (enabledProviders.discord) {
    const guildId = process.env.DISCORD_GUILD_ID
    const adminRoleIds = (process.env.DISCORD_ADMIN_ROLE_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    passport.use(
      new DiscordStrategy(
        {
          clientID: process.env.DISCORD_CLIENT_ID,
          clientSecret: process.env.DISCORD_CLIENT_SECRET,
          callbackURL: `${BASE}/auth/discord/callback`,
          // guilds.members.read lets us read the user's roles in our guild.
          scope: ['identify', 'guilds.members.read'],
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const avatar = profile.avatar
              ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
              : null

            // Sync roles from the community server.
            const roleIds = await fetchGuildMemberRoles(accessToken, guildId)
            const discordRoles = await resolveRoles(roleIds, guildId, process.env.DISCORD_BOT_TOKEN)
            const adminByProvider = roleIds.some((id) => adminRoleIds.includes(id))

            const user = upsertUser({
              provider: 'discord',
              providerId: profile.id,
              username: profile.global_name || profile.username,
              avatar,
              discordRoles,
              adminByProvider,
            })
            done(null, user)
          } catch (err) {
            done(err)
          }
        },
      ),
    )
  }

  if (enabledProviders.steam) {
    passport.use(
      new SteamStrategy(
        {
          returnURL: `${BASE}/auth/steam/callback`,
          realm: `${BASE}/`,
          apiKey: process.env.STEAM_API_KEY,
        },
        (identifier, profile, done) => {
          const user = upsertUser({
            provider: 'steam',
            providerId: profile.id,
            username: profile.displayName,
            avatar: profile.photos?.[2]?.value || profile.photos?.[0]?.value || null,
            profileUrl: profile._json?.profileurl || null,
          })
          done(null, user)
        },
      ),
    )
  }
}
