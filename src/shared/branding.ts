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

/** Full GitHub repository URL, e.g. "https://github.com/owner/repo". */
export const repoUrl = `https://github.com/${updateRepo}`

/** Deep-link prefix, e.g. "clashapp://". */
export const deepLinkPrefix = `${protocolScheme}://`

/** Matches a deep link anywhere in a string, e.g. clashapp://install-config?... */
export const deepLinkPattern = new RegExp(`${protocolScheme}:\\/\\/[^\\s"']+`, 'i')
