// Single source of truth for app branding. Forking this project? Edit
// branding.json at the repo root — every runtime and build-time consumer
// derives its names from there. See electron-builder.config.cjs for the
// build/installer side.
import branding from '../../branding.json'

export const {
  appId,
  productName,
  appName,
  packageName,
  protocolScheme,
  protocolName,
  userAgentProduct,
  updateUserAgent,
  updateRepo
} = branding

// VPN-identity fields. Read defensively (cast + fallback) so an overlay fork whose
// branding.json predates these keys still compiles and runs. Each fork should set its
// own values so two forks don't collide on the same TUN adapter / proxy port / fake-ip.
const brandingRecord = branding as Record<string, unknown>

/**
 * TUN (Wintun/utun) adapter name for this fork. Falls back to the unique packageName
 * rather than the legacy literal "mihomo", so a fork that forgets to set it still gets a
 * non-colliding adapter name instead of silently piggybacking another core's adapter.
 */
export const tunDeviceName = (brandingRecord.tunDeviceName as string | undefined) ?? packageName

/** Default mixed-port for this fork's mihomo inbound listener. */
export const mixedPort = (brandingRecord.mixedPort as number | undefined) ?? 7897

/** Default DNS fake-ip range for this fork. */
export const fakeIpRange = (brandingRecord.fakeIpRange as string | undefined) ?? '198.18.0.1/16'

/** Full GitHub repository URL, e.g. "https://github.com/owner/repo". */
export const repoUrl = `https://github.com/${updateRepo}`

/** Deep-link prefix, e.g. "clashapp://". */
export const deepLinkPrefix = `${protocolScheme}://`

/** Matches a deep link anywhere in a string, e.g. clashapp://install-config?... */
export const deepLinkPattern = new RegExp(`${protocolScheme}:\\/\\/[^\\s"']+`, 'i')
