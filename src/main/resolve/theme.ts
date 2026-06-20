import { copyFile, readdir, readFile, writeFile } from 'fs/promises'
import { themesDir } from '../utils/dirs'
import { t } from '../utils/i18n'
import path from 'path'
import axios from 'axios'
import https from 'https'
import AdmZip from 'adm-zip'
import { getRuntimeConfig } from '../core/factory'
import { existsSync } from 'fs'
import { mainWindow } from '..'
import { floatingWindow } from './floatingWindow'
import { customTrayWindow } from './tray'
import defaultThemeCss from '../../../resources/default-theme.css?raw'

let insertedCSSKeyMain: string | undefined = undefined
let insertedCSSKeyFloating: string | undefined = undefined
let insertedCSSKeyTray: string | undefined = undefined

export async function resolveThemes(): Promise<{ key: string; label: string }[]> {
  const files = await readdir(themesDir())
  const themes = await Promise.all(
    files
      .filter((file) => file.endsWith('.css'))
      .map(async (file) => {
        const css = (await readFile(path.join(themesDir(), file), 'utf-8')) || ''
        let name = file
        if (css.startsWith('/*')) {
          name = css.split('\n')[0].replace('/*', '').replace('*/', '').trim() || file
        }
        return { key: file, label: name }
      })
  )
  if (themes.find((theme) => theme.key === 'default.css')) {
    return themes
  } else {
    return [{ key: 'default.css', label: t('ui.defaultTheme') }, ...themes]
  }
}

export async function fetchThemes(): Promise<void> {
  const zipUrl = 'https://github.com/mihomo-party-org/theme-hub/releases/download/latest/themes.zip'
  const { 'mixed-port': mixedPort = 0 } = (await getRuntimeConfig()) ?? {}
  const zipData = await axios.get(zipUrl, {
    responseType: 'arraybuffer',
    headers: { 'Content-Type': 'application/octet-stream' },
    ...(mixedPort != 0 && {
      proxy: {
        protocol: 'http',
        host: '127.0.0.1',
        port: mixedPort
      }
    })
  })
  const zip = new AdmZip(zipData.data as Buffer)
  zip.extractAllTo(themesDir(), true)
}

export async function importThemes(files: string[]): Promise<void> {
  for (const file of files) {
    if (existsSync(file))
      await copyFile(
        file,
        path.join(themesDir(), `${new Date().getTime().toString(16)}-${path.basename(file)}`)
      )
  }
}

export async function readTheme(theme: string): Promise<string> {
  const themePath = path.join(themesDir(), theme)
  if (existsSync(themePath)) return await readFile(themePath, 'utf-8')
  // `default.css` is virtual (no file on disk). Fall back to the theme bundled
  // at build time: empty upstream (so the compiled default look shows), but a
  // brand overlay can replace resources/default-theme.css to ship its own
  // default theme without needing the `custom-css` subscription header.
  if (theme === 'default.css') return defaultThemeCss
  return ''
}

export async function writeTheme(theme: string, css: string): Promise<void> {
  await writeFile(path.join(themesDir(), theme), css)
}

export async function applyTheme(theme: string): Promise<void> {
  const css = await readTheme(theme)
  await mainWindow?.webContents.removeInsertedCSS(insertedCSSKeyMain || '')
  insertedCSSKeyMain = await mainWindow?.webContents.insertCSS(css)
  try {
    await floatingWindow?.webContents.removeInsertedCSS(insertedCSSKeyFloating || '')
    insertedCSSKeyFloating = await floatingWindow?.webContents.insertCSS(css)
  } catch {
    // ignore
  }
  try {
    if (customTrayWindow && !customTrayWindow.isDestroyed()) {
      await customTrayWindow.webContents.removeInsertedCSS(insertedCSSKeyTray || '')
      insertedCSSKeyTray = await customTrayWindow.webContents.insertCSS(css)
    }
  } catch {
    // ignore
  }
}

export async function downloadCustomCss(
  url: string,
  proxy?: { protocol: string; host: string; port: number },
  existingFile?: string
): Promise<string> {
  const httpsAgent = new https.Agent()
  const res = await axios.get(url, {
    httpsAgent,
    ...(proxy && { proxy }),
    responseType: 'text',
    timeout: 15000
  })
  const css = String(res.data)
  const label = new URL(url).pathname.split('/').pop()?.replace(/\.css$/i, '') || 'Custom Theme'
  const content = `/* ${label} */\n${css}`
  if (existingFile) {
    const existingPath = path.join(themesDir(), existingFile)
    if (existsSync(existingPath)) {
      const existing = await readFile(existingPath, 'utf-8')
      if (existing === content) return existingFile
    }
    await writeFile(path.join(themesDir(), existingFile), content, 'utf-8')
    return existingFile
  }
  const filename = `custom-${Date.now().toString(16)}.css`
  await writeFile(path.join(themesDir(), filename), content, 'utf-8')
  return filename
}
