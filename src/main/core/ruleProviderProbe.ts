import axios, { AxiosResponse } from 'axios'
import https from 'https'
import { createHash } from 'crypto'
import { writeFile } from 'fs/promises'
import { getRuntimeConfig } from './factory'
import { mihomoUpdateRuleProviders } from './mihomoApi'
import { getCurrentProfileItem } from '../config'
import {
  getRuleProviderCache,
  patchRuleProviderEntry,
  pruneRuleProviderCache,
  RuleProviderCacheEntry
} from '../config/ruleProviderCache'
import { getUserAgent } from '../utils/userAgent'
import { getHWID, getDeviceOS, getOSVersion, getDeviceModel } from '../utils/deviceInfo'
import { logPath } from '../utils/dirs'
import { emitProgress } from '../utils/progress'
import { mainWindow } from '..'

type ProbeReason = 'etag' | 'last-modified' | 'hash' | '304' | 'url-changed' | 'baseline'

interface ProbeOk {
  name: string
  changed: boolean
  reason: ProbeReason
  skipped?: false
}

interface ProbeSkipped {
  name: string
  changed: false
  skipped: true
  error: string
}

type ProbeResult = ProbeOk | ProbeSkipped

interface ProbeOptions {
  useProxy: boolean
  mixedPort: number
  userAgent: string
}

async function log(message: string): Promise<void> {
  try {
    await writeFile(logPath(), `[RuleProviderProbe]: ${message}\n`, { flag: 'a' })
  } catch {
    // logging must never break the probe
  }
}

// Weak ETags (W/"abc") and strong ETags ("abc") for the same body should compare
// equal — strip the weak prefix before comparing. Mismatch only risks one harmless
// extra re-pull, never a missed update.
function normalizeEtag(etag: string | undefined): string | undefined {
  return etag?.replace(/^W\//, '')
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// Re-pull a single provider via the core, retrying a few times with backoff. The
// probe runs right after the subscription hot-reload, while the core's proxy groups
// may still be settling (health checks / outbound not ready) — and a provider with a
// `proxy:` group fetches THROUGH that group, so its first PUT can transiently fail
// even though the same call succeeds a second later. Retrying self-tunes: it returns
// the instant the core is ready. Returns the last error on give-up, or null on success.
async function updateRuleProviderWithRetry(name: string): Promise<unknown | null> {
  const backoff = [0, 800, 1600]
  let lastErr: unknown = null
  for (const wait of backoff) {
    if (wait) await delay(wait)
    try {
      await mihomoUpdateRuleProviders(name)
      return null
    } catch (e) {
      lastErr = e
    }
  }
  return lastErr ?? new Error('unknown')
}

// Conditional GET against a single provider's source url. Decides whether the
// remote content changed without transferring the body in the unchanged case
// (304), and falls back to comparing our own sha256 of the body when the server
// sends no validators. Never throws — failures resolve to { skipped: true }.
async function probeRuleProvider(
  name: string,
  url: string,
  opts: ProbeOptions
): Promise<ProbeResult> {
  try {
    const cache = await getRuleProviderCache()
    const cached = cache[name]
    const sameUrl = cached?.url === url

    const headers: Record<string, string> = {
      'User-Agent': opts.userAgent,
      'x-hwid': getHWID(),
      'x-device-os': getDeviceOS(),
      'x-ver-os': getOSVersion(),
      'x-device-model': getDeviceModel()
    }
    // Only send validators when they belong to the current url.
    if (sameUrl && cached?.etag) headers['If-None-Match'] = cached.etag
    if (sameUrl && cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified

    const res: AxiosResponse<ArrayBuffer> = await axios.get(url, {
      httpsAgent: new https.Agent(),
      ...(opts.useProxy &&
        opts.mixedPort && {
          proxy: { protocol: 'http', host: '127.0.0.1', port: opts.mixedPort }
        }),
      headers,
      responseType: 'arraybuffer',
      timeout: 10000,
      maxRedirects: 5,
      // The repo's axios default rejects 304 as an error — accept it explicitly so
      // the cheap "not modified" path works.
      validateStatus: (s) => s === 200 || s === 304
    })

    if (res.status === 304 && cached) {
      await patchRuleProviderEntry(name, { ...cached, url, checkedAt: Date.now() })
      return { name, changed: false, reason: '304' }
    }

    const body = Buffer.from(res.data)
    const etag = (res.headers['etag'] as string) || undefined
    const lastModified = (res.headers['last-modified'] as string) || undefined
    const hash = sha256(body)
    const newEntry: RuleProviderCacheEntry = {
      url,
      etag,
      lastModified,
      hash,
      size: body.length,
      checkedAt: Date.now()
    }

    let changed: boolean
    let reason: ProbeReason
    if (!cached) {
      // First probe: trust the core's freshly-loaded file, record a baseline only.
      changed = false
      reason = 'baseline'
    } else if (!sameUrl) {
      changed = true
      reason = 'url-changed'
    } else if (cached.etag && etag) {
      changed = normalizeEtag(etag) !== normalizeEtag(cached.etag)
      reason = 'etag'
    } else if (cached.lastModified && lastModified) {
      changed = lastModified !== cached.lastModified
      reason = 'last-modified'
    } else if (cached.hash) {
      changed = hash !== cached.hash
      reason = 'hash'
    } else {
      changed = false
      reason = 'baseline'
    }

    await patchRuleProviderEntry(name, newEntry)
    return { name, changed, reason }
  } catch (e) {
    return {
      name,
      changed: false,
      skipped: true,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

// Probe every HTTP rule-provider of the CURRENT profile and, for those whose
// remote source actually changed, trigger mihomoUpdateRuleProviders so the core
// re-pulls + hot-swaps just that provider (the PUT alone reloads it in-place —
// no config hot reload / restart needed).
export async function probeAndUpdateRuleProviders(): Promise<{
  updated: string[]
  checked: number
  failed: string[]
}> {
  const runtime = await getRuntimeConfig()
  if (!runtime) return { updated: [], checked: 0, failed: [] }

  // The runtime value is the flat config record (Record<name, {url, ...}>), not the
  // controller-response shape its TS type claims — cast through unknown.
  const ruleProviders =
    (runtime['rule-providers'] as unknown as Record<string, { url?: string }>) || {}
  const httpEntries = Object.entries(ruleProviders).filter(
    ([, p]) => typeof p?.url === 'string' && p.url.length > 0
  ) as [string, { url: string }][]
  const httpNames = new Set(httpEntries.map(([name]) => name))

  if (httpEntries.length === 0) {
    await pruneRuleProviderCache(httpNames)
    return { updated: [], checked: 0, failed: [] }
  }

  const mixedPort = runtime['mixed-port'] || 0
  const userAgent = await getUserAgent()
  const current = await getCurrentProfileItem()
  const useProxy = current?.useProxy ?? false

  const results = await mapWithConcurrency(httpEntries, 6, ([name, p]) =>
    probeRuleProvider(name, p.url, { useProxy, mixedPort, userAgent })
  )

  const updated: string[] = []
  const failed: string[] = []
  for (const r of results) {
    if ('skipped' in r && r.skipped) {
      failed.push(r.name)
      continue
    }
    if (r.changed) {
      // Narrate into the home status log (ignored unless an action is in flight).
      emitProgress('updatingRuleProvider', { name: r.name })
      const err = await updateRuleProviderWithRetry(r.name)
      if (err === null) {
        updated.push(r.name)
      } else {
        failed.push(r.name)
        await log(`PUT ${r.name} failed: ${err instanceof Error ? err.message : JSON.stringify(err)}`)
      }
    }
  }

  await pruneRuleProviderCache(httpNames)
  await log(
    `checked ${httpEntries.length}, updated [${updated.join(', ')}], failed [${failed.join(', ')}]`
  )
  if (updated.length) {
    mainWindow?.webContents.send('rulesUpdated')
  }
  return { updated, checked: httpEntries.length, failed }
}
