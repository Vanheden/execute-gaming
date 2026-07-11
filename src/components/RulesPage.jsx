import { community } from '../data/servers.js'

// ---------------------------------------------------------------------------
// RulesPage (/rules) — the full ruleset for the Duo PvP server: core rules,
// FFA zones + zone list, and raiding rules. Kept as plain data arrays so the
// rules are easy to tweak without touching the markup.
// ---------------------------------------------------------------------------

// Quick-reference "the gist" chips shown up top.
const GIST = [
  { icon: '👥', label: 'Max 2 per clan' },
  { icon: '🏰', label: '1 shard per clan' },
  { icon: '🛡️', label: '16 ilvl PvP protection' },
  { icon: '🕗', label: 'Raids: Fri–Sun 20–23 (GMT+1)' },
]

// Core server rules. `example`/`exception` render as tagged sub-lines.
const CORE_RULES = [
  {
    icon: '⚔️',
    title: 'Duo only',
    body:
      'This is a DUO server: max 2 players per clan. No alliances, no unofficial team-ups, no third wheels lurking in voice chat. If it looks like a zerg and smells like a zerg, it gets purged.',
    note: '“But we’re just hanging out!” — the gods of PvP disagree. It’s teaming, and it’s not allowed.',
  },
  {
    icon: '🏰',
    title: 'One shard per clan',
    body: 'Each clan may hold only ONE soul shard at a time. One shard to rule them all.',
  },
  {
    icon: '🤝',
    title: 'PvE collabs — within limits',
    body:
      'You may team up casually in PvE: world bosses, farming, general co-op. What you may NOT do is use PvE cooperation as a backdoor for PvP teaming.',
    note: 'We see you. The shadows have eyes.',
  },
  {
    icon: '🛡️',
    title: 'PvP fair play',
    body:
      'You may not initiate PvP against players more than 16 item levels below you. This protects progression and discourages bullying of newer or undergeared players.',
    example: 'At ilvl 70 you may not attack anyone below ilvl 54 — unless they engage you first.',
    exception: 'Does not apply in FFA zones or at contested objectives (see below).',
  },
  {
    icon: '🧛',
    title: 'Be a decent vampire',
    body:
      'No harassment, racism, hate speech, or general toxicity. We’re cold-blooded, not cold-hearted. Banter is fine; bullying is not.',
    note: 'Salt belongs on your blood-crusted steak, not in global chat.',
  },
  {
    icon: '💬',
    title: 'Global chat etiquette',
    body: 'No spamming. English only in global chat, so everyone can follow along.',
  },
  {
    icon: '🛠️',
    title: 'No exploits, hacks or bug abuse',
    body:
      'Don’t. Just don’t. Any form of cheating or exploit abuse earns a permanent trip to the eternal graveyard (a.k.a. a ban).',
  },
  {
    icon: '👑',
    title: 'Admins have the final word',
    body:
      'Admins reserve the right to investigate, warn, or ban at their discretion. Unsure whether something’s allowed? Just ask — better safe than staked.',
  },
]

// FFA-zone conduct rules.
const FFA_CONDUCT = [
  'You need a reason to be there — farming resources, fighting bosses, progressing. Just camping to clap lowbies? Not cool.',
  'No camping. If an area is cleared out (no resources left) and you’re just loitering — especially as a high-ilvl player — you’re in the wrong.',
  'Use common sense and good vibes. This rule exists so everyone gets a fair shot at progression.',
]

// Current FFA zones (PvP always allowed, item-level protection off).
const FFA_ZONES = [
  { icon: '🪙', name: 'Silverlight Hills', sub: 'Silver Mine' },
  { icon: '👻', name: 'Haunted Iron Mine', sub: null },
  { icon: '🕷️', name: 'Spider Cave', sub: 'Ungora the Spider Queen' },
  { icon: '🏙️', name: 'Brighthaven City', sub: null },
  { icon: '🧟', name: 'Cursed Forest', sub: 'Ancient Village' },
  { icon: '🧪', name: 'Dunley Monastery', sub: null },
  { icon: '🌋', name: 'Ruins of Mortium', sub: 'Endgame — no mercy, no whining' },
]

// Raiding rules.
const RAID_RULES = [
  {
    icon: '🧱',
    title: 'Expect to be raided',
    body:
      'This is a PvP server — raids come with the territory. But don’t grief for the sake of griefing (repeated spawn camping, destroying everything without looting). Play with honor — or at least pretend to.',
  },
  {
    icon: '🚫',
    title: 'No counter-raiding',
    body:
      'You may not raid or interfere with another clan’s raid during the raid window. If you didn’t start the siege, stay out of it — no third-party interference, looting, or harassment.',
    note: 'Violations earn warnings or bans depending on severity.',
  },
  {
    icon: '🔒',
    title: 'Offline raiding',
    body:
      'You may only raid when at least one member of the defending clan is online, and you’re responsible for confirming that (via PvP interaction or the castle UI). If defenders log off mid-raid, you may finish it only if it was clearly underway before they disconnected.',
  },
]

export default function RulesPage() {
  return (
    <section className="section rulepage" id="rules">
      <div className="container">
        <div className="section__head">
          <p className="section__eyebrow">Duo PvP · Server law</p>
          <h2 className="section__title">Server Rules</h2>
          <p className="section__lead">
            Welcome, creatures of the night. Before you sink your teeth into the world, read these
            ancient-yet-binding scrolls of server law — here to keep things fair, fun, and fang-tastic
            for everyone.
          </p>
        </div>

        {/* The gist — quick reference */}
        <ul className="rulepage__gist">
          {GIST.map((g) => (
            <li className="rulepage__chip" key={g.label}>
              <span aria-hidden="true">{g.icon}</span> {g.label}
            </li>
          ))}
        </ul>

        {/* Core rules */}
        <ol className="ruleset">
          {CORE_RULES.map((r, i) => (
            <li className="rulecard" key={r.title}>
              <span className="rulecard__num">{String(i + 1).padStart(2, '0')}</span>
              <div className="rulecard__body">
                <h3 className="rulecard__title">
                  <span aria-hidden="true">{r.icon}</span> {r.title}
                </h3>
                <p>{r.body}</p>
                {r.example && (
                  <p className="rulecard__tagline">
                    <span className="rulecard__tag rulecard__tag--example">Example</span> {r.example}
                  </p>
                )}
                {r.exception && (
                  <p className="rulecard__tagline">
                    <span className="rulecard__tag rulecard__tag--exception">Exception</span> {r.exception}
                  </p>
                )}
                {r.note && <p className="rulecard__note">{r.note}</p>}
              </div>
            </li>
          ))}
        </ol>

        {/* FFA zones */}
        <div className="rulepage__block">
          <h3 className="rulepage__blocktitle">⚔️ FFA Zones — all bets are off</h3>
          <p className="rulepage__blocklead">
            Some areas are Free-For-All. Inside them, PvP is allowed regardless of item-level
            differences — the 16-ilvl protection is off. But don’t be a jerk:
          </p>
          <ul className="rulepage__ffaconduct">
            {FFA_CONDUCT.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>

          <h4 className="rulepage__subtitle">🗺️ Current FFA zones</h4>
          <p className="rulepage__blocklead">
            PvP is always allowed here — enter at your own risk. This list is updated regularly.
          </p>
          <ul className="ffa__list">
            {FFA_ZONES.map((z) => (
              <li className="ffa__zone" key={z.name}>
                <span className="ffa__icon" aria-hidden="true">
                  {z.icon}
                </span>
                <span className="ffa__name">
                  {z.name}
                  {z.sub && <span className="ffa__sub">{z.sub}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Raiding */}
        <div className="rulepage__block">
          <h3 className="rulepage__blocktitle">🧱 Raiding Rules</h3>
          <div className="rulepage__raidhours">
            <span className="rulepage__raidhours-label">🕗 Raid window</span>
            <span className="rulepage__raidhours-time">
              20:00 – 23:00 · Fri, Sat &amp; Sun (GMT+1)
            </span>
            <span className="rulepage__raidhours-note">Subject to change</span>
          </div>
          <ol className="ruleset ruleset--raid">
            {RAID_RULES.map((r) => (
              <li className="rulecard" key={r.title}>
                <span className="rulecard__num" aria-hidden="true">
                  {r.icon}
                </span>
                <div className="rulecard__body">
                  <h3 className="rulecard__title">{r.title}</h3>
                  <p>{r.body}</p>
                  {r.note && <p className="rulecard__note">{r.note}</p>}
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="rulepage__foot">
          Questions or a rules dispute? Bring it up calmly in{' '}
          <a href={community.discord} target="_blank" rel="noreferrer">
            our Discord
          </a>
          . Play with honor. 🦇
        </p>
      </div>
    </section>
  )
}
