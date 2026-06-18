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
    allowCurrentUserHome: false
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
    afterInstall: 'build/linux/postinst'
  },
  rpm: {
    afterInstall: 'build/linux/postinst'
  },
  pacman: {
    afterInstall: 'build/linux/postinst',
    artifactName: '${productName}_${arch}.pkg.tar.xz'
  },
  npmRebuild: true,
  publish: []
}
