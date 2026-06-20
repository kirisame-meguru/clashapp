// electron-builder configuration, driven by branding.json so a fork can
// re-skin the installer/app identity from a single place. Generates
// build/nsis/branding.nsh (scheduled-task / autostart names) as a side effect
// so installer.nsh can clean up entries created by the running app.
const fs = require('fs')
const path = require('path')
const branding = require('./branding.json')

const nshPath = path.join(__dirname, 'build', 'nsis', 'branding.nsh')
fs.writeFileSync(
  nshPath,
  [
    '; AUTO-GENERATED from branding.json by electron-builder.config.cjs - do not edit.',
    `!define APP_TASK_NAME "${branding.packageName}"`,
    `!define APP_TASK_RUNNER_NAME "${branding.packageName}-run"`,
    `!define APP_LOGON_TASK_NAME "${branding.packageName}-logon"`,
    ''
  ].join('\n')
)

// The Linux/macOS install scripts reference the app by its product name, but they
// run on the end-user machine where branding.json is unavailable - so the name must
// be baked in at build time. Each committed script is a template with an
// @@APP_NAME@@ placeholder; render it into build/generated/ with productName and
// point electron-builder at the rendered copies. (build/generated is gitignored.)
const renderInstallScript = (srcRel, outRel) => {
  const out = path.join(__dirname, outRel)
  const rendered = fs
    .readFileSync(path.join(__dirname, srcRel), 'utf8')
    .replace(/@@APP_NAME@@/g, branding.productName)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, rendered)
  fs.chmodSync(out, 0o755)
}
renderInstallScript('build/linux/postinst', 'build/generated/linux/postinst')
renderInstallScript('build/pkg-scripts/preinstall', 'build/generated/pkg-scripts/preinstall')
renderInstallScript('build/pkg-scripts/postinstall', 'build/generated/pkg-scripts/postinstall')

module.exports = {
  appId: branding.appId,
  productName: branding.productName,
  directories: {
    buildResources: 'build'
  },
  files: [
    '!**/.vscode/*',
    '!src/*',
    '!aur/*',
    '!images/*',
    '!scripts/*',
    '!extra/*',
    '!tailwind.config.js',
    '!postcss.config.js',
    '!electron.vite.config.{js,ts,mjs,cjs}',
    '!{.eslintignore,.eslintrc.cjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}',
    '!{.env,.env.*,.npmrc,pnpm-lock.yaml}',
    '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
  ],
  extraResources: [
    {
      from: './extra/',
      to: ''
    }
  ],
  protocols: {
    name: branding.protocolName,
    schemes: [branding.protocolScheme]
  },
  win: {
    icon: 'build/icon.ico',
    target: ['nsis', '7z'],
    artifactName: '${productName}_${arch}-portable.${ext}'
  },
  nsis: {
    artifactName: '${productName}_${arch}-setup.${ext}',
    installerIcon: 'build/installerIcon.ico',
    uninstallerIcon: 'build/icon.ico',
    uninstallDisplayName: '${productName}',
    allowToChangeInstallationDirectory: true,
    oneClick: false,
    perMachine: true,
    createDesktopShortcut: true,
    include: 'build/nsis/installer.nsh'
  },
  mac: {
    target: ['pkg'],
    hardenedRuntime: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Notarize only when the workflow injects Apple API-key env (i.e. signing).
    // Unsigned builds leave APPLE_API_KEY_ID unset -> notarize: false.
    notarize: process.env.APPLE_API_KEY_ID ? true : false,
    extendInfo: [
      { NSCameraUsageDescription: "Application requests access to the device's camera." },
      { NSMicrophoneUsageDescription: "Application requests access to the device's microphone." },
      {
        NSDocumentsFolderUsageDescription:
          "Application requests access to the user's Documents folder."
      },
      {
        NSDownloadsFolderUsageDescription:
          "Application requests access to the user's Downloads folder."
      }
    ],
    artifactName: '${productName}_${arch}.${ext}'
  },
  pkg: {
    allowAnywhere: false,
    allowCurrentUserHome: false,
    scripts: 'build/generated/pkg-scripts'
  },
  linux: {
    desktop: {
      entry: {
        Name: branding.productName,
        MimeType: `x-scheme-handler/${branding.protocolScheme}`
      }
    },
    target: ['deb', 'rpm', 'pacman'],
    maintainer: 'kirisame-meguru',
    category: 'Utility',
    artifactName: '${productName}_${arch}.${ext}'
  },
  deb: {
    afterInstall: 'build/generated/linux/postinst'
  },
  rpm: {
    afterInstall: 'build/generated/linux/postinst'
  },
  pacman: {
    afterInstall: 'build/generated/linux/postinst',
    artifactName: '${productName}_${arch}.pkg.tar.xz'
  },
  npmRebuild: true,
  publish: []
}
