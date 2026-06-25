import Database from 'better-sqlite3'
import { readFileSync, rmSync } from 'fs'
import { appCacheDbPath, ruleProviderCachePath } from './dirs'

// Single shared SQLite database for the app's regenerable caches (currently the
// rule-provider HTTP validators; future tables — latency history, subscription
// metadata, … — go here too). Schema is versioned through PRAGMA user_version so
// each future change is one more `if (from < N)` block in migrate().

let db: Database.Database | undefined

const SCHEMA_VERSION = 1

export function getDb(): Database.Database {
  if (db) return db
  const handle = new Database(appCacheDbPath())
  // WAL gives concurrent reads + fewer fsyncs; NORMAL is the safe pairing with
  // WAL and plenty durable for a cache; busy_timeout is cheap insurance.
  handle.pragma('journal_mode = WAL')
  handle.pragma('synchronous = NORMAL')
  handle.pragma('busy_timeout = 5000')
  handle.pragma('foreign_keys = ON')
  migrate(handle)
  db = handle
  return db
}

function migrate(handle: Database.Database): void {
  const from = handle.pragma('user_version', { simple: true }) as number
  if (from >= SCHEMA_VERSION) return
  handle.transaction(() => {
    if (from < 1) {
      handle.exec(
        `CREATE TABLE IF NOT EXISTS rule_provider_cache (
           name         TEXT PRIMARY KEY NOT NULL,
           url          TEXT NOT NULL,
           etag         TEXT,
           lastModified TEXT,
           hash         TEXT,
           size         INTEGER,
           checkedAt    INTEGER NOT NULL
         )`
      )
      importLegacyJson(handle)
    }
    handle.pragma(`user_version = ${SCHEMA_VERSION}`)
  })()
}

// Shape of the legacy rule-provider-cache.json (untrusted file content) — every
// field optional since it's parsed from disk and only validated at use.
type LegacyEntry = Partial<{
  url: string
  etag: string
  lastModified: string
  hash: string
  size: number
  checkedAt: number
}>

// One-time import of the old rule-provider-cache.json so users keep their
// validator baseline (no spurious "everything changed" re-pull after upgrade).
// Fires exactly once, gated by user_version; the JSON is deleted afterwards.
function importLegacyJson(handle: Database.Database): void {
  let parsed: Record<string, LegacyEntry> | undefined
  try {
    const raw = readFileSync(ruleProviderCachePath(), 'utf-8')
    const data = JSON.parse(raw)
    if (data && typeof data === 'object') parsed = data
  } catch {
    // no legacy file or unreadable/corrupt → start fresh
  }
  if (parsed) {
    const stmt = handle.prepare(
      `INSERT INTO rule_provider_cache (name, url, etag, lastModified, hash, size, checkedAt)
       VALUES (@name, @url, @etag, @lastModified, @hash, @size, @checkedAt)
       ON CONFLICT(name) DO UPDATE SET
         url = excluded.url, etag = excluded.etag, lastModified = excluded.lastModified,
         hash = excluded.hash, size = excluded.size, checkedAt = excluded.checkedAt`
    )
    for (const [name, e] of Object.entries(parsed)) {
      if (!e || typeof e.url !== 'string' || e.url.length === 0) continue
      stmt.run({
        name,
        url: e.url,
        etag: e.etag ?? null,
        lastModified: e.lastModified ?? null,
        hash: e.hash ?? null,
        size: e.size ?? null,
        checkedAt: typeof e.checkedAt === 'number' ? e.checkedAt : Date.now()
      })
    }
  }
  // Best-effort removal — if it fails, user_version >= 1 still prevents re-import.
  try {
    rmSync(ruleProviderCachePath())
  } catch {
    // ignore
  }
}

// Fold the WAL back into the main file and close. Called at quit (see ../index).
// Skipping this is not data loss — WAL auto-recovers on the next getDb() — it
// just leaves the -wal/-shm sidecars until the next launch.
export function closeDb(): void {
  if (!db) return
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
  } catch {
    // ignore
  }
  try {
    db.close()
  } catch {
    // ignore
  }
  db = undefined
}
