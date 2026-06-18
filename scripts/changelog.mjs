const sectionFrom = (lines, start, level) => {
  const boundaryRe = new RegExp(`^#{1,${level}}\\s`)
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (boundaryRe.test(lines[i])) {
      end = i
      break
    }
  }
  return lines.slice(start, end).join('\n').trim()
}

export const extractVersionSection = (text, version) => {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const lines = text.split('\n')

  // CI versions can carry a prerelease suffix (e.g. 0.0.3-beta-<hash>) that never
  // appears in a changelog heading; match on the base x.y.z instead.
  const baseVersion = version.split('-')[0]
  const escapedVer = baseVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const headingRe = new RegExp(`^(#{1,6})\\s.*?v?${escapedVer}(?![\\w.-])`)

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRe)
    if (match) {
      return sectionFrom(lines, i, match[1].length)
    }
  }

  // Version not found in the changelog: fall back to the topmost version section
  // instead of the whole file, so a release never dumps every past version's notes.
  const versionHeadingRe = /^(#{1,6})\s.*?v?\d+\.\d+\.\d+/
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(versionHeadingRe)
    if (match) {
      return sectionFrom(lines, i, match[1].length)
    }
  }

  return trimmed
}
