import { getDb } from '../utils/db'

// Per-rule-provider HTTP validators, persisted so the change-detector probe
// (see ../core/ruleProviderProbe) can ask "did the remote actually change?"
// without re-downloading the whole body. Keyed by provider NAME (the same key
// mihomoUpdateRuleProviders needs); `url` is stored inside the entry so a url
// change for the same name can be detected and the stale validators discarded.
// Backed by the shared SQLite cache DB (../utils/db) — every write is committed
// synchronously, so no in-memory write serialization is needed.
export interface RuleProviderCacheEntry {
  url: string
  etag?: string
  lastModified?: string
  hash?: string // our own sha256(hex) of the last fetched raw body
  size?: number // diagnostic only — never a change signal (gzip skews it)
  checkedAt: number
}

export type RuleProviderCache = Record<string, RuleProviderCacheEntry>

interface CacheRow {
  name: string
  url: string
  etag: string | null
  lastModified: string | null
  hash: string | null
  size: number | null
  checkedAt: number
}

// Map SQL NULL → undefined so the probe's truthiness checks (cached?.etag,
// cached.hash, …) behave exactly as they did against the JSON map.
function rowToEntry(r: CacheRow): RuleProviderCacheEntry {
  return {
    url: r.url,
    etag: r.etag ?? undefined,
    lastModified: r.lastModified ?? undefined,
    hash: r.hash ?? undefined,
    size: r.size ?? undefined,
    checkedAt: r.checkedAt
  }
}

// `force` is retained for signature compatibility but is a no-op: the DB is the
// single source of truth, so every call reads current rows.
export async function getRuleProviderCache(_force = false): Promise<RuleProviderCache> {
  const rows = getDb().prepare('SELECT * FROM rule_provider_cache').all() as CacheRow[]
  const cache: RuleProviderCache = {}
  for (const row of rows) cache[row.name] = rowToEntry(row)
  return cache
}

export async function patchRuleProviderEntry(
  name: string,
  entry: RuleProviderCacheEntry
): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO rule_provider_cache (name, url, etag, lastModified, hash, size, checkedAt)
       VALUES (@name, @url, @etag, @lastModified, @hash, @size, @checkedAt)
       ON CONFLICT(name) DO UPDATE SET
         url = excluded.url, etag = excluded.etag, lastModified = excluded.lastModified,
         hash = excluded.hash, size = excluded.size, checkedAt = excluded.checkedAt`
    )
    .run({
      name,
      url: entry.url,
      etag: entry.etag ?? null,
      lastModified: entry.lastModified ?? null,
      hash: entry.hash ?? null,
      size: entry.size ?? null,
      checkedAt: entry.checkedAt
    })
}

// Drop cache entries for providers that are no longer present in the config.
export async function pruneRuleProviderCache(currentNames: Set<string>): Promise<void> {
  const db = getDb()
  const names = [...currentNames]
  if (names.length === 0) {
    db.prepare('DELETE FROM rule_provider_cache').run()
    return
  }
  const placeholders = names.map(() => '?').join(', ')
  db.prepare(`DELETE FROM rule_provider_cache WHERE name NOT IN (${placeholders})`).run(...names)
}
