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
    id           TEXT PRIMARY KEY,
    provider     TEXT NOT NULL,
    providerId   TEXT NOT NULL,
    username     TEXT NOT NULL,
    avatar       TEXT,
    profileUrl   TEXT,
    role         TEXT NOT NULL DEFAULT 'member',
    discordRoles TEXT,
    createdAt    TEXT NOT NULL,
    lastLogin    TEXT NOT NULL
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
`)
