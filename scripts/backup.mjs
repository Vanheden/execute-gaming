// ---------------------------------------------------------------------------
// Database backup — a consistent snapshot of server/data/users.db
// ---------------------------------------------------------------------------
// Uses SQLite `VACUUM INTO`, which writes a clean, fully-checkpointed copy even
// while the app is running with WAL enabled (no half-written pages). Keeps the
// most recent N backups and prunes the rest.
//
//   node scripts/backup.mjs
//
// Env:
//   BACKUP_DIR   where to write backups (default: server/data/backups)
//   BACKUP_KEEP  how many to keep       (default: 14)
//
// Schedule it nightly with cron on the server — see CLAUDE.md ("Backups").
// ---------------------------------------------------------------------------
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'server', 'data')
const DB_FILE = join(DATA_DIR, 'users.db')
const BACKUP_DIR = process.env.BACKUP_DIR || join(DATA_DIR, 'backups')
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP) || 14)

if (!existsSync(DB_FILE)) {
  console.error(`No database at ${DB_FILE} — nothing to back up.`)
  process.exit(1)
}
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })

// Timestamp like 2026-07-08_0312 (sortable, filename-safe).
const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '')
const outFile = join(BACKUP_DIR, `users-${stamp}.db`)

const db = new DatabaseSync(DB_FILE)
// VACUUM INTO needs a plain path with single quotes escaped.
db.exec(`VACUUM INTO '${outFile.replace(/'/g, "''")}'`)
db.close()

const sizeKb = (statSync(outFile).size / 1024).toFixed(1)
console.log(`Backup written: ${outFile} (${sizeKb} kB)`)

// Prune: keep the newest KEEP backups.
const backups = readdirSync(BACKUP_DIR)
  .filter((f) => f.startsWith('users-') && f.endsWith('.db'))
  .sort() // timestamped names sort chronologically
const excess = backups.slice(0, Math.max(0, backups.length - KEEP))
for (const f of excess) {
  rmSync(join(BACKUP_DIR, f))
  console.log(`Pruned old backup: ${f}`)
}
console.log(`Kept ${Math.min(backups.length, KEEP)} backup(s), pruned ${excess.length}.`)
