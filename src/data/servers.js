// ---------------------------------------------------------------------------
// Server configuration
// ---------------------------------------------------------------------------
// Fill in your real values here. The live-status fields (`query` and
// `battlemetricsId`) are used by src/services/serverStatus.js when you connect
// a real API. See README.md for how to do that.
//
// Feel free to swap the images in /public/servers/ for your own
// screenshots / banners.
// ---------------------------------------------------------------------------

export const servers = [
  {
    id: 'vrising-pve',
    name: 'V Rising — Easy PvE',
    game: 'V Rising',
    mode: 'Easy PvE · x3',
    tagline: 'Relaxed co-op with x3 loot & craft. Build your castle and beat the bosses together — no griefing.',
    accent: '#22d3ee',
    image: '/servers/vrising-pve.svg',
    connect: '',
    ip: '158.174.144.145:9876',
    maxPlayers: 40,
    tags: ['Survival', 'PvE', 'Co-op'],
    // For live status via BattleMetrics: fill in the server id.
    battlemetricsId: '35400462',
  },
  {
    id: 'vrising-duo',
    name: 'V Rising — Duo PvP',
    game: 'V Rising',
    mode: 'Duo PvP · x3',
    tagline: 'Two against the world with x3 rates and monthly wipes. Raid, defend, and rise to the top in pairs.',
    accent: '#ff5db1',
    image: '/servers/vrising-duo.svg',
    connect: '',
    ip: '158.174.144.145:9878',
    maxPlayers: 40,
    tags: ['Survival', 'PvP', 'Duo'],
    battlemetricsId: '38909658',
  },
]

// Links for the community section — swap for your real ones.
export const community = {
  discord: 'https://discord.gg/r29Tpc95fS',
  steamGroup: '',
  name: 'Execute-Gaming',
}
