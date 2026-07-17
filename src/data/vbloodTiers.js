// ---------------------------------------------------------------------------
// V Blood boss difficulty tiers (PrefabGUID -> tier).
// ---------------------------------------------------------------------------
// Sourced from the V Rising Mod Wiki prefab dump (each boss's Act + power value).
// `tier` is the story act the boss belongs to (I-IV, then 'Shard' for the endgame
// Shardbearers like Dracula); `diff` is a monotonic difficulty score for ordering
// (e.g. 'toughest boss felled'). Primal (Gate Boss) variants inherit their base
// boss's tier. Any GUID not listed (a new boss after a patch) has no tier -> the UI
// simply omits the badge. This is display-only; it does NOT affect points/ranking.
// ---------------------------------------------------------------------------
export const VBLOOD_TIERS = {
  '-1905691330': { tier: 'I', diff: 180 },
  '1124739990': { tier: 'I', diff: 240 },
  '-2025101517': { tier: 'I', diff: 240 },
  '2122229952': { tier: 'I', diff: 240 },
  '1106149033': { tier: 'I', diff: 300 },
  '577478542': { tier: 'I', diff: 300 },
  '763273073': { tier: 'I', diff: 300 },
  '1896428751': { tier: 'I', diff: 300 },
  '-2039908510': { tier: 'I', diff: 180 },
  '-2122682556': { tier: 'I', diff: 300 },
  '-484556888': { tier: 'I', diff: 300 },
  '-1391546313': { tier: 'I', diff: 300 },
  '153390636': { tier: 'I', diff: 480 },
  '-1659822956': { tier: 'I', diff: 300 },
  '-1942352521': { tier: 'II', diff: 480 },
  '-29797003': { tier: 'II', diff: 480 },
  '-99012450': { tier: 'II', diff: 480 },
  '-1449631170': { tier: 'II', diff: 480 },
  '619948378': { tier: 'II', diff: 480 },
  '-1365931036': { tier: 'II', diff: 480 },
  '939467639': { tier: 'II', diff: 300 },
  '1945956671': { tier: 'II', diff: 480 },
  '613251918': { tier: 'II', diff: 480 },
  '910988233': { tier: 'II', diff: 480 },
  '850622034': { tier: 'II', diff: 480 },
  '-1065970933': { tier: 'II', diff: 480 },
  '24378719': { tier: 'II', diff: 480 },
  '795262842': { tier: 'II', diff: 480 },
  '-753453016': { tier: 'II', diff: 480 },
  '-496360395': { tier: 'II', diff: 480 },
  '-1968372384': { tier: 'II', diff: 480 },
  '-680831417': { tier: 'II', diff: 480 },
  '1688478381': { tier: 'II', diff: 480 },
  '172235178': { tier: 'III', diff: 480 },
  '-1101874342': { tier: 'III', diff: 480 },
  '106480588': { tier: 'III', diff: 480 },
  '-548489519': { tier: 'III', diff: 480 },
  '109969450': { tier: 'III', diff: 480 },
  '-1208888966': { tier: 'III', diff: 480 },
  '-203043163': { tier: 'III', diff: 480 },
  '-1505705712': { tier: 'III', diff: 480 },
  '326378955': { tier: 'III', diff: 480 },
  '-26105228': { tier: 'IV', diff: 480 },
  '192051202': { tier: 'IV', diff: 480 },
  '685266977': { tier: 'IV', diff: 600 },
  '-2013903325': { tier: 'IV', diff: 480 },
  '814083983': { tier: 'IV', diff: 600 },
  '-1383529374': { tier: 'IV', diff: 480 },
  '-1669199769': { tier: 'IV', diff: 480 },
  '1295855316': { tier: 'IV', diff: 480 },
  '-910296704': { tier: 'IV', diff: 600 },
  '-1347412392': { tier: 'IV', diff: 480 },
  '114912615': { tier: 'IV', diff: 600 },
  '2054432370': { tier: 'IV', diff: 600 },
  '336560131': { tier: 'IV', diff: 600 },
  '173259239': { tier: 'IV', diff: 600 },
  '1112948824': { tier: 'IV', diff: 600 },
  '-1936575244': { tier: 'IV', diff: 900 },
  '495971434': { tier: 'IV', diff: 600 },
  '-740796338': { tier: 'Shard', diff: 600 },
  '-393555055': { tier: 'Shard', diff: 900 },
  '591725925': { tier: 'Shard', diff: 900 },
  '1233988687': { tier: 'Shard', diff: 900 },
  '-327335305': { tier: 'Shard', diff: 1000 },
  '17609984': { tier: 'I', diff: 240 },
  '-1420322422': { tier: 'I', diff: 240 },
  '1854211210': { tier: 'I', diff: 300 },
  '478580792': { tier: 'I', diff: 300 },
  '1318855899': { tier: 'I', diff: 240 },
  '-1381375644': { tier: 'I', diff: 300 },
  '-1822337177': { tier: 'I', diff: 300 },
  '-989493184': { tier: 'II', diff: 480 },
  '1494126678': { tier: 'II', diff: 480 },
  '2009018555': { tier: 'II', diff: 480 },
  '1990744594': { tier: 'II', diff: 480 },
  '-1805216630': { tier: 'II', diff: 300 },
  '-982850914': { tier: 'II', diff: 480 },
  '468179469': { tier: 'II', diff: 480 },
  '282791819': { tier: 'II', diff: 480 },
  '-943858353': { tier: 'III', diff: 480 },
  '-1160778038': { tier: 'III', diff: 480 },
  '-440174408': { tier: 'III', diff: 480 },
  '-427888732': { tier: 'III', diff: 480 },
  '-1189707552': { tier: 'III', diff: 480 },
  '2079933370': { tier: 'III', diff: 480 },
  '666177656': { tier: 'IV', diff: 480 },
}

// Display metadata per tier: a short label + a difficulty-ramp colour.
export const VBLOOD_TIER_META = {
  I: { label: 'Act I', color: '#9aa3b2' },
  II: { label: 'Act II', color: '#34c6d8' },
  III: { label: 'Act III', color: '#a366e6' },
  IV: { label: 'Act IV', color: '#ff8a3d' },
  Shard: { label: 'Shardbearer', color: '#ffd24a' },
}

// Tier + display meta for a V Blood PrefabGUID (number or string), or null if unknown.
export function vbloodTier(guid) {
  if (guid == null) return null
  const t = VBLOOD_TIERS[String(guid)]
  return t ? { ...t, ...VBLOOD_TIER_META[t.tier] } : null
}
