import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
// https://github.com/vdesjs/vite-plugin-monaco-editor/issues/21#issuecomment-1827562674
import monacoEditorPluginModule from 'vite-plugin-monaco-editor'
import tailwindcss from '@tailwindcss/vite'

const isObjectWithDefaultFunction = (
  module: unknown
): module is { default: typeof monacoEditorPluginModule } =>
  module != null &&
  typeof module === 'object' &&
  'default' in module &&
  typeof module.default === 'function'
const monacoEditorPlugin = isObjectWithDefaultFunction(monacoEditorPluginModule)
  ? monacoEditorPluginModule.default
  : monacoEditorPluginModule

// Window titles are derived from branding.json so a fork only edits that file.
// Each renderer HTML uses the %RENDERER_TITLE% placeholder; this plugin replaces
// it per entry at build/serve time (no runtime flash, single source of truth).
const branding = JSON.parse(readFileSync(resolve('branding.json'), 'utf-8')) as { appName: string }

function brandWindowTitle(): Plugin {
  return {
    name: 'brand-window-title',
    transformIndexHtml(html, ctx): string {
      const id = ctx.filename.replace(/\\/g, '/')
      const title = id.endsWith('floating.html')
        ? `${branding.appName} Floating`
        : id.endsWith('traymenu.html')
          ? `${branding.appName} Tray Menu`
          : branding.appName
      return html.replace(/%RENDERER_TITLE%/g, title)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    // Pin the dev server to IPv4. On Windows `localhost` resolves to IPv6 `::1`
    // first; if Vite binds only to `::1`, Electron's `http://localhost:5173`
    // (which resolves to 127.0.0.1) gets ERR_CONNECTION_REFUSED -> white screen.
    server: {
      host: '127.0.0.1'
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          floating: resolve('src/renderer/floating.html'),
          traymenu: resolve('src/renderer/traymenu.html')
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [
      brandWindowTitle(),
      react(),
      tailwindcss(),
      monacoEditorPlugin({
        languageWorkers: ['editorWorkerService', 'typescript', 'css'],
        customDistPath: (_, out) => `${out}/monacoeditorwork`,
        customWorkers: [
          {
            label: 'yaml',
            entry: 'monaco-yaml/yaml.worker'
          }
        ]
      })
    ]
  }
})
