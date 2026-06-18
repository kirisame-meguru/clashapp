import { app, BrowserWindow, dialog, net, shell, type MessageBoxOptions } from 'electron'
import { t } from '../utils/i18n'
import { updateRepo, updateUserAgent } from '../../shared/branding'

const UPDATE_REPO = updateRepo
const LATEST_RELEASE_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
const MAX_CHANGELOG_LENGTH = 1800

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
}

interface GithubRelease {
  tag_name: string
  name?: string
  body?: string
  html_url: string
  draft?: boolean
  prerelease?: boolean
  assets?: GithubReleaseAsset[]
}

interface ParsedVersion {
  numbers: number[]
  prerelease: string
}

function parseVersion(version: string): ParsedVersion | undefined {
  const normalized = version.trim().replace(/^v/i, '')
  const [main, prerelease = ''] = normalized.split('-', 2)
  const parts = main.split('.')

  if (parts.length < 2 || parts.length > 3) return undefined

  const numbers = parts.map((part) => Number.parseInt(part, 10))
  if (numbers.some((part) => Number.isNaN(part))) return undefined

  while (numbers.length < 3) {
    numbers.push(0)
  }

  return { numbers, prerelease }
}

function compareVersions(current: string, latest: string): number {
  const currentVersion = parseVersion(current)
  const latestVersion = parseVersion(latest)

  if (!currentVersion || !latestVersion) return 0

  for (let i = 0; i < 3; i++) {
    const diff = latestVersion.numbers[i] - currentVersion.numbers[i]
    if (diff !== 0) return diff
  }

  if (currentVersion.prerelease && !latestVersion.prerelease) return 1
  if (!currentVersion.prerelease && latestVersion.prerelease) return -1

  return latestVersion.prerelease.localeCompare(currentVersion.prerelease)
}

function pickDownloadUrl(release: GithubRelease): string {
  const assets = release.assets ?? []
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  const platformMatchers =
    process.platform === 'win32'
      ? [`${arch}-setup.exe`, 'setup.exe']
      : process.platform === 'darwin'
        ? [`${arch}.pkg`, '.pkg']
        : [process.arch === 'arm64' ? 'arm64.deb' : 'amd64.deb', '.deb', '.rpm']

  for (const matcher of platformMatchers) {
    const asset = assets.find((item) => {
      const name = item.name.toLowerCase()
      return (
        name.includes(matcher) &&
        !name.endsWith('.blockmap') &&
        !name.endsWith('.sha256')
      )
    })
    if (asset) return asset.browser_download_url
  }

  return release.html_url
}

function normalizeChangelog(body: string | undefined): string {
  if (!body) return ''
  // Drop the build-appended "### Download link：" section (badge HTML).
  const cutIdx = body.search(/^#{1,6}\s+.*Download link/im)
  let source = cutIdx >= 0 ? body.slice(0, cutIdx) : body

  // Defensive: a release body holds one version's notes, but if a second
  // "## x.y.z" heading is present, keep only the topmost section.
  const lines = source.split('\n')
  const verRe = /^#{1,6}\s+v?\d+\.\d+\.\d+/
  const firstVer = lines.findIndex((l) => verRe.test(l))
  if (firstVer >= 0) {
    const nextVer = lines.findIndex((l, i) => i > firstVer && verRe.test(l))
    if (nextVer >= 0) source = lines.slice(0, nextVer).join('\n')
  }

  const out: string[] = []
  let lastWasHeading = false
  for (const raw of source.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (verRe.test(line)) {
      // drop the version heading; the dialog shows it as its own line
      lastWasHeading = false
      continue
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      // "### Subheading" -> "- Subheading"
      if (out.length && out[out.length - 1] !== '') out.push('')
      out.push(`- ${heading[1].trim()}`)
      lastWasHeading = true
      continue
    }
    if (line.trim() === '') {
      // collapse blanks; drop the blank that follows a heading
      if (lastWasHeading || !out.length || out[out.length - 1] === '') continue
      out.push('')
      continue
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/)
    out.push(bullet ? bullet[1] : line)
    lastWasHeading = false
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}

function formatChangelog(body: string | undefined): string {
  const normalized = normalizeChangelog(body)
  if (normalized.length <= MAX_CHANGELOG_LENGTH) return normalized
  return `${normalized.slice(0, MAX_CHANGELOG_LENGTH).trimEnd()}\n...`
}

async function fetchLatestRelease(): Promise<GithubRelease | undefined> {
  const response = await net.fetch(LATEST_RELEASE_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': updateUserAgent
    }
  })

  if (!response.ok) return undefined

  const release = (await response.json()) as GithubRelease
  if (!release || release.draft || release.prerelease || !release.tag_name) return undefined

  return release
}

export async function checkForAppUpdates(parent?: BrowserWindow | null): Promise<void> {
  if (!app.isPackaged) return

  try {
    const release = await fetchLatestRelease()
    if (!release) return

    const currentVersion = app.getVersion()
    const latestVersion = release.tag_name.replace(/^v/i, '')
    if (compareVersions(currentVersion, latestVersion) <= 0) return

    const changelog = formatChangelog(release.body)
    const options: MessageBoxOptions = {
      type: 'info',
      title: t('dialog.updateAvailable'),
      message: `${t('dialog.currentVersion')}: ${currentVersion}, ${t('dialog.newVersion')}: ${latestVersion}.`,
      detail: changelog ? `${t('dialog.changelogHeader')}\n${changelog}` : '',
      buttons: [t('dialog.downloadUpdate'), t('dialog.later')],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    }

    const result =
      parent && !parent.isDestroyed()
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options)

    if (result.response === 0) {
      await shell.openExternal(pickDownloadUrl(release))
    }
  } catch {
    // Update checks must never interrupt normal app startup.
  }
}
