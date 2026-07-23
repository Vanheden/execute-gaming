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
    // Live status + player count via a direct Steam A2S query on the query port
    // (game port + 1). First-party and free — no BattleMetrics needed.
    query: { host: '158.174.144.145', port: 9877 },
    details: {
      wipe: 'No scheduled wipe — build to last',
      rates: 'x3 Loot & Craft · full offline protection',
      rules: [
        'No griefing or claiming other players’ builds',
        'PvP is off — this is a co-op server',
        'Be respectful in chat and voice',
        'No cheats, hacks, or exploits',
      ],
      mods: 'Vanilla+ quality-of-life tweaks. No pay-to-win.',
      info: 'A relaxed server for building, exploring and beating the bosses together. Great for newcomers.',
    },
  },
  {
    id: 'vrising-duo',
    name: 'V Rising — Duo PvP',
    game: 'V Rising',
    mode: 'Duo PvP · x3',
    tagline: 'Two against the world with x3 rates and monthly wipes. Raid, defend, and rise to the top in pairs.',
    accent: '#e63950',
    image: '/servers/vrising-duo.svg',
    connect: '',
    ip: '158.174.144.145:9878',
    maxPlayers: 40,
    tags: ['Survival', 'PvP', 'Duo'],
    query: { host: '158.174.144.145', port: 9879 },
    details: {
      wipe: 'Monthly wipe — first Friday of the month',
      rates: 'x3 Loot & Craft · max clan size 2',
      rules: [
        'Teams of max 2 players — no allying',
        'Raiding is allowed; no stream-sniping or cheating',
        'No blocking spawn or trader zones',
        'No cheats, hacks, or exploits — instant ban',
      ],
      mods: 'Vanilla+ with raid-time restrictions. No pay-to-win.',
      info: 'Hardcore duo PvP. Raid, defend and climb the ladder — fresh start every month.',
    },
  },
]

// Links for the community section — swap for your real ones.
export const community = {
  discord: 'https://discord.gg/r29Tpc95fS',
  steamGroup: '',
  name: 'Execute-Gaming',
}
