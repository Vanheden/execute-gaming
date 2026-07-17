// ---------------------------------------------------------------------------
// Shared SQLite connection + schema
// ---------------------------------------------------------------------------
// One database file (server/data/users.db) shared by all stores. Tables are
// created here; per-feature CRUD lives in store.js / content.js.
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = join(__dirname, 'data')
const DB_FILE = join(DATA_DIR, 'users.db')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(DB_FILE)
db.exec('PRAGMA journal_mode = WAL;') // durability + concurrent reads
db.exec('PRAGMA foreign_keys = ON;')

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    provider       TEXT NOT NULL,
    providerId     TEXT NOT NULL,
    username       TEXT NOT NULL,
    avatar         TEXT,
    profileUrl     TEXT,
    role           TEXT NOT NULL DEFAULT 'member',
    discordRoles   TEXT,
    bio            TEXT,
    favoriteServer TEXT,
    createdAt      TEXT NOT NULL,
    lastLogin      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS news (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    authorId   TEXT,
    authorName TEXT,
    createdAt  TEXT NOT NULL,
    updatedAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    startsAt    TEXT NOT NULL,
    location    TEXT,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    body       TEXT,
    authorId   TEXT NOT NULL,
    authorName TEXT,
    status     TEXT NOT NULL DEFAULT 'open',
    createdAt  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestion_votes (
    suggestionId INTEGER NOT NULL,
    userId       TEXT NOT NULL,
    PRIMARY KEY (suggestionId, userId),
    FOREIGN KEY (suggestionId) REFERENCES suggestions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS server_stats (
    serverId   TEXT NOT NULL,
    players    INTEGER NOT NULL,
    maxPlayers INTEGER NOT NULL,
    at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stats_server_at ON server_stats(serverId, at);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Admin-granted achievements (automatic ones are computed, not stored).
  CREATE TABLE IF NOT EXISTS achievements (
    userId    TEXT NOT NULL,
    code      TEXT NOT NULL,
    grantedAt TEXT NOT NULL,
    grantedBy TEXT,
    PRIMARY KEY (userId, code),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Admin action log (role changes, bans, achievement grants, …).
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    at         TEXT NOT NULL,
    actorId    TEXT,
    actorName  TEXT,
    action     TEXT NOT NULL,
    targetId   TEXT,
    targetName TEXT,
    detail     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);

  -- Privacy-friendly page views (no PII): a per-day, per-path counter.
  CREATE TABLE IF NOT EXISTS page_views (
    day   TEXT NOT NULL,
    path  TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, path)
  );

  -- Play sessions ingested from the in-game BepInEx mod, keyed by a mod-issued
  -- sessionId (one per connect). Heartbeats and the final disconnect UPSERT the
  -- same row, so ingest is idempotent and crash-safe (last write wins). Powers
  -- the playtime leaderboard. endedAt is NULL while the player is still online.
  CREATE TABLE IF NOT EXISTS play_sessions (
    sessionId TEXT PRIMARY KEY,
    serverId  TEXT NOT NULL,
    steamId   TEXT NOT NULL,
    charName  TEXT,
    startedAt TEXT NOT NULL,
    endedAt   TEXT,
    seconds   INTEGER NOT NULL DEFAULT 0,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_steam ON play_sessions(steamId);
  CREATE INDEX IF NOT EXISTS idx_sessions_server_started ON play_sessions(serverId, startedAt);

  -- Discrete kill events ingested from the same in-game mod, keyed by a mod-issued
  -- eventId so re-posts are idempotent (INSERT OR IGNORE — a kill is counted once).
  -- kind is 'vblood' (a V Blood boss kill) or 'pvp' (killing another player).
  -- Powers the V Blood / PvP / combined-points leaderboards.
  CREATE TABLE IF NOT EXISTS kill_events (
    eventId    TEXT PRIMARY KEY,
    serverId   TEXT NOT NULL,
    steamId    TEXT NOT NULL,
    charName   TEXT,
    kind       TEXT NOT NULL,
    victim     TEXT,
    occurredAt TEXT NOT NULL,
    createdAt  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_kills_steam ON kill_events(steamId);
  CREATE INDEX IF NOT EXISTS idx_kills_server_occurred ON kill_events(serverId, occurredAt);
  CREATE INDEX IF NOT EXISTS idx_kills_kind ON kill_events(kind);

  -- Castle raid events ingested from the same mod (v0.4.0+), keyed by a mod-issued
  -- eventId so re-posts are idempotent (INSERT OR IGNORE). One row per raid: an
  -- attacker (raider) took/destroyed a defender's castle heart. Either side's steamId
  -- and clan may be NULL (a clanless solo raider, or an unresolved owner). Powers the
  -- raid feed + per-clan raid record. kind is 'raid' (reserved: 'breach'/'claim').
  CREATE TABLE IF NOT EXISTS raid_events (
    eventId          TEXT PRIMARY KEY,
    serverId         TEXT NOT NULL,
    kind             TEXT NOT NULL,
    attackerSteamId  TEXT,
    attackerName     TEXT,
    attackerClanGuid TEXT,
    attackerClanName TEXT,
    defenderSteamId  TEXT,
    defenderName     TEXT,
    defenderClanGuid TEXT,
    defenderClanName TEXT,
    occurredAt       TEXT NOT NULL,
    createdAt        TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_raids_server_occurred ON raid_events(serverId, occurredAt);
  CREATE INDEX IF NOT EXISTS idx_raids_attacker_clan ON raid_events(attackerClanGuid);
  CREATE INDEX IF NOT EXISTS idx_raids_defender_clan ON raid_events(defenderClanGuid);

  -- Highest rank tier each player has reached (index into src/data/ranks.js).
  -- Lets us fire a one-off Discord "rank up" webhook the moment a player crosses
  -- into a new tier: the row is seeded silently on first ingest, then only bumped
  -- upward, so deploying the feature never spams past promotions. See discord.js.
  CREATE TABLE IF NOT EXISTS player_ranks (
    steamId   TEXT PRIMARY KEY,
    tierIndex INTEGER NOT NULL,
    updatedAt TEXT NOT NULL
  );

  -- Linked provider identities. One account (users.id) can own several — e.g. a
  -- Discord-primary member who also linked their Steam. Every account has at least
  -- its own (its provider+providerId → its id). Login and getUserByProvider resolve
  -- through this, so a linked Steam login lands on the primary account and the
  -- leaderboard attributes that SteamID to it.
  CREATE TABLE IF NOT EXISTS user_identities (
    provider   TEXT NOT NULL,
    providerId TEXT NOT NULL,
    userId     TEXT NOT NULL,
    linkedAt   TEXT NOT NULL,
    PRIMARY KEY (provider, providerId),
    FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(userId);
`)

// Backfill each existing account's own identity (idempotent — PK is provider+providerId).
db.exec(`
  INSERT OR IGNORE INTO user_identities (provider, providerId, userId, linkedAt)
  SELECT provider, providerId, id, createdAt FROM users
`)

// --- Lightweight column migrations (for DBs created before a column existed) -
function ensureColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
  }
}
ensureColumn('users', 'bio', 'TEXT')
ensureColumn('users', 'favoriteServer', 'TEXT')
ensureColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0')
ensureColumn('users', 'banReason', 'TEXT')
ensureColumn('users', 'note', 'TEXT')

// Clan attribution, denormalised at event time (like charName). A stable per-clan
// GUID (rename-proof) plus the display name captured at the moment of the session/
// kill; the site keys clans by (serverId, clanGuid) and shows the latest name.
ensureColumn('play_sessions', 'clanGuid', 'TEXT')
ensureColumn('play_sessions', 'clanName', 'TEXT')
ensureColumn('kill_events', 'clanGuid', 'TEXT')
ensureColumn('kill_events', 'clanName', 'TEXT')
// PvP only: the victim's clan at kill time, so kills resolve to clan-vs-clan wars.
ensureColumn('kill_events', 'victimClanGuid', 'TEXT')
ensureColumn('kill_events', 'victimClanName', 'TEXT')
// PvP only (mod v0.7.0+): the victim's SteamID, so rivalries resolve exactly instead
// of guessing from the victim's character name. NULL/empty on older rows (name-fallback).
ensureColumn('kill_events', 'victimSteamId', 'TEXT')
db.exec('CREATE INDEX IF NOT EXISTS idx_sessions_clan ON play_sessions(serverId, clanGuid);')
db.exec('CREATE INDEX IF NOT EXISTS idx_kills_clan ON kill_events(serverId, clanGuid);')
