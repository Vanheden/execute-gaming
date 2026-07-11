// ---------------------------------------------------------------------------
// V Blood boss PrefabGUID → readable name.
// ---------------------------------------------------------------------------
// The in-game mod sends a V Blood kill's `victim` as the boss's PrefabGUID hash
// (a stable integer, sent as a string). This maps them to a name so the
// leaderboard can show "Latest Kill: Alpha the White Wolf" instead of a number.
//
// Source: the V Rising Mod Wiki prefab dump (CHAR_* PrefabGUID → GuidHash), which
// is the game's own prefab hash the mod actually sends. There are TWO GUIDs per
// mid-tier boss: the normal one and the harder "Primal" Gate Boss variant
// (CHAR_..._GateBoss_Minor / _Major) that spawns on Brutal-difficulty servers.
// Both are listed and map to the same boss name (see the Primal section below).
// Any hash NOT in this table (e.g. a new boss after a game update) falls back to a
// neutral "V Blood boss" label on the site — never a guess.
// ---------------------------------------------------------------------------
export const VBLOOD_NAMES = {
  '-1905691330': 'Alpha the White Wolf',
  '1124739990': 'Keely the Frost Archer',
  '-2025101517': 'Errol the Stonebreaker',
  '2122229952': 'Rufus the Foreman',
  '1106149033': 'Grayson the Armourer',
  '577478542': 'Goreswine the Ravager',
  '763273073': 'Lidia the Chaos Archer',
  '1896428751': 'Clive the Firestarter',
  '-2039908510': 'Nibbles the Putrid Rat',
  '-2122682556': 'Finn the Fisherman',
  '-484556888': 'Polora the Feywalker',
  '-1391546313': 'Kodia the Ferocious Bear',
  '153390636': 'Nicholaus the Fallen',
  '-1659822956': 'Quincey the Bandit King',
  '-1942352521': 'Beatrice the Tailor',
  '-29797003': 'Vincent the Frostbringer',
  '-99012450': 'Christina the Sun Priestess',
  '-1449631170': 'Tristan the Vampire Hunter',
  '619948378': 'Sir Erwin the Gallant Cavalier',
  '-1365931036': 'Kriig the Undead General',
  '939467639': 'Leandra the Shadow Priestess',
  '1945956671': 'Maja the Dark Savant',
  '613251918': 'Bane the Shadowblade',
  '910988233': 'Grethel the Glassblower',
  '850622034': 'Meredith the Bright Archer',
  '-1065970933': 'Terah the Geomancer',
  '24378719': 'Frostmaw the Mountain Terror',
  '795262842': 'General Elena the Hollow',
  '-753453016': 'Gaius the Cursed Champion',
  '-496360395': 'General Cassius the Betrayer',
  '-1968372384': 'Jade the Vampire Hunter',
  '-680831417': 'Raziel the Shepherd',
  '1688478381': 'Octavian the Militia Captain',
  '172235178': 'Ziva the Engineer',
  '-1101874342': 'Domina the Blade Dancer',
  '106480588': 'Angram the Purifier',
  '-548489519': 'Ungora the Spider Queen',
  '109969450': 'Ben the Old Wanderer',
  '-1208888966': 'Foulrot the Soultaker',
  '-203043163': 'Albert the Duke of Balaton',
  '-1505705712': 'Willfred the Village Elder',
  '326378955': 'Cyril the Cursed Smith',
  '-26105228': 'Sir Magnus the Overseer',
  '192051202': 'Baron du Bouchon the Sommelier',
  '685266977': 'Morian the Stormwing Matriarch',
  '-2013903325': 'Mairwyn the Elementalist',
  '814083983': 'Henry Blackbrew the Doctor',
  '-1383529374': 'Jakira the Shadow Huntress',
  '-1669199769': 'Stavros the Carver',
  '1295855316': 'Lucile the Venom Alchemist',
  '-910296704': 'Matka the Curse Weaver',
  '-1347412392': 'Terrorclaw the Ogre',
  '114912615': 'Azariel the Sunbringer',
  '2054432370': 'Voltatia the Power Master',
  '336560131': 'Simon Belmont the Vampire Hunter',
  '173259239': 'Dantos the Forgebinder',
  '1112948824': 'Lord Styx the Night Champion',
  '-1936575244': 'Gorecrusher the Behemoth',
  '495971434': 'General Valencia the Depraved',
  '-740796338': 'Solarus the Immaculate',
  '-393555055': 'Talzur the Winged Horror',
  '591725925': 'Megara the Serpent Queen',
  '1233988687': 'Adam the Firstborn',
  '-327335305': 'Dracula the Immortal King',

  // --- Primal / Gate Boss variants -----------------------------------------
  // On Brutal-difficulty servers (e.g. our Duo PvP server) the mid-tier bosses
  // spawn as their harder "Primal" versions, which are DISTINCT prefabs
  // (CHAR_..._GateBoss_Minor / _Major) with different PrefabGUIDs. The mod sends
  // the killed character's GUID, so a Primal kill would otherwise fall back to
  // the neutral "V Blood boss" label. Each Primal GUID maps to the same readable
  // boss name as its normal counterpart. (Endgame bosses have no Primal variant.)
  // Source: V Rising Mod Wiki prefab dump (CHAR_*_GateBoss_* → All.json GuidHash).
  '17609984': 'Rufus the Foreman', // Primal (CHAR_Bandit_Foreman_VBlood_GateBoss_Minor)
  '-1420322422': 'Errol the Stonebreaker', // Primal (CHAR_Bandit_StoneBreaker_VBlood_GateBoss_Minor)
  '1854211210': 'Lidia the Chaos Archer', // Primal (CHAR_Bandit_Chaosarrow_GateBoss_Minor)
  '478580792': 'Quincey the Bandit King', // Primal (CHAR_Bandit_Tourok_GateBoss_Minor)
  '1318855899': 'Keely the Frost Archer', // Primal (CHAR_Frostarrow_GateBoss_Minor)
  '-1381375644': 'Polora the Feywalker', // Primal (CHAR_Poloma_VBlood_GateBoss_Minor)
  '-1822337177': 'Goreswine the Ravager', // Primal (CHAR_Undead_BishopOfDeath_VBlood_GateBoss_Minor)
  '-989493184': 'Kriig the Undead General', // Primal (CHAR_Undead_Leader_Vblood_GateBoss_Minor)
  '1494126678': 'Vincent the Frostbringer', // Primal (CHAR_Militia_Guard_VBlood_GateBoss_Minor)
  '2009018555': 'Tristan the Vampire Hunter', // Primal (CHAR_VHunter_Leader_GateBoss_Minor)
  '1990744594': 'Octavian the Militia Captain', // Primal (CHAR_Militia_Leader_VBlood_GateBoss_Major)
  '-1805216630': 'Leandra the Shadow Priestess', // Primal (CHAR_Undead_BishopOfShadows_VBlood_GateBoss_Major)
  '-982850914': 'Bane the Shadowblade', // Primal (CHAR_Undead_Infiltrator_VBlood_GateBoss_Major)
  '468179469': 'Frostmaw the Mountain Terror', // Primal (CHAR_Wendigo_GateBoss_Major)
  '282791819': 'Jade the Vampire Hunter', // Primal (CHAR_VHunter_Jade_VBlood_GateBoss_Major)
  '-943858353': 'Ungora the Spider Queen', // Primal (CHAR_Spider_Queen_VBlood_GateBoss_Major)
  '-1160778038': 'Ben the Old Wanderer', // Primal (CHAR_Villager_CursedWanderer_VBlood_GateBoss_Major)
  '-440174408': 'Angram the Purifier', // Primal (CHAR_Gloomrot_Purifier_VBlood_GateBoss_Major)
  '-427888732': 'Domina the Blade Dancer', // Primal (CHAR_Gloomrot_Voltage_VBlood_GateBoss_Major)
  '-1189707552': 'Foulrot the Soultaker', // Primal (CHAR_Undead_ZealousCultist_VBlood_GateBoss_Major)
  '2079933370': 'Willfred the Village Elder', // Primal (CHAR_WerewolfChieftain_VBlood_GateBoss_Major)
  '666177656': 'Terrorclaw the Ogre', // Primal (CHAR_Winter_Yeti_VBlood_GateBoss_Major)
}

// Resolve a PrefabGUID hash (number or string) to a known boss name, or null if we
// don't have it mapped. Callers show a neutral fallback for null — never a guess.
export function vbloodName(victim) {
  if (victim == null) return null
  return VBLOOD_NAMES[String(victim)] || null
}

// The canonical list of distinct V Blood bosses, deduped by name so the normal and
// Primal (Gate Boss) variants of the same boss count as ONE. Insertion order keeps
// the normal entry first, so this is the 64 unique bosses. Use this — not
// Object.keys(VBLOOD_NAMES) — for "X of Y" completion so a Brutal-server player who
// only ever meets Primal variants still scores against the right denominator.
export const VBLOOD_BOSSES = [...new Set(Object.values(VBLOOD_NAMES))]

// Group a player's felled victim GUIDs into distinct boss names (Primal + normal
// collapse to one). Unknown GUIDs pass through as-is so they still count as felled.
export function bossNamesForGuids(guids) {
  return new Set(Array.from(guids, (g) => VBLOOD_NAMES[String(g)] || String(g)))
}
