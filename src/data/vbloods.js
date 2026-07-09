// ---------------------------------------------------------------------------
// V Blood boss PrefabGUID → readable name.
// ---------------------------------------------------------------------------
// The in-game mod sends a V Blood kill's `victim` as the boss's PrefabGUID hash
// (a stable integer, sent as a string). This maps them to a name so the
// leaderboard can show "Latest Kill: Alpha the White Wolf" instead of a number.
//
// Source: the official V Rising wiki's "V Blood Unit IDs" table
// (https://vrising.fandom.com/wiki/Server_Settings — VBloodUnitSetting structure).
// These UnitIds are the game's own prefab hashes, so they're authoritative.
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
}

// Resolve a PrefabGUID hash (number or string) to a known boss name, or null if we
// don't have it mapped. Callers show a neutral fallback for null — never a guess.
export function vbloodName(victim) {
  if (victim == null) return null
  return VBLOOD_NAMES[String(victim)] || null
}
