## 0.0.6

Fixes the broken elevation task runner after the run-repo move.

### Fixes

- fixed the bundled elevation task runner shipping as a 9-byte "Not Found" stub: the build requested `koala-clash-run.exe` from `kirisame-meguru/clashapp-run`, but the rebranded release asset is named `clashapp-run.exe`, so GitHub returned a 404 body that was written to disk as the executable
- made the prepare download step fail on a non-2xx response instead of silently saving the error body as the asset

## 0.0.3

Reworks Windows elevation and restores cross-platform CI builds.

### Behavior

- reworked Windows elevation to use scheduled tasks: on-demand elevation via a silent UAC prompt with an elevated-retry guard, and an elevated logon task for autostart (plain Startup folder only in service mode)
- the NSIS installer now registers the elevation tasks on install and cleans up legacy entries on uninstall
- reformatted the update dialog changelog: extracts the matching version section, strips build badges, and shows "Current version: X, new version: Y" with plain-text notes
- clicking Settings in the nav while already on the Settings page now navigates Home
- the subscription URL dialog now autofills from the clipboard when it holds a valid http(s) link

### Build & release

- restored the cross-platform build matrix (Windows x64/arm64, Ubuntu x64/arm64, macOS x64/arm64) with per-platform build commands
- made macOS signing and notarization conditional on the signing secrets being present, so unsigned builds complete cleanly
- threw on transient version-fetch errors so the CI retry loop can recover instead of exiting

## 0.0.2

Rebrands the app to **ClashApp** and ships two bug fixes.

### Rebrand

- renamed the app from Bitumi Clash to ClashApp, including the `clashapp://` deep-link scheme
- centralized all branding (name, app id, protocol scheme, update repo) into a single `branding.json` so a fork can re-skin in one place
- pointed repository and update-check links at `kirisame-meguru/clashapp`

### Behavior

- made settings-change detection opt-in per subscription, gated behind the `X-Clashapp-Unsupported-Cfg-Warn` response header (off by default)
- disabling the global-mode slider now immediately drops the proxy back to Rule mode

### Fixes

- fixed INFO log entries rendering in pink; restored the blue color
- fixed a startup crash on a fresh profile caused by the dev-only TUN reset running before the config files were created

### Build & release

- renamed `build.ps1` to `build_win.ps1` and added a corepack bootstrap when it is missing
- moved electron-builder to a JS config that derives installer and product names from `branding.json`

## 0.0.1

First release of **Bitumi Clash**, a Windows-focused fork of Koala Clash.

### Rebrand

- renamed the app from Koala Clash to Bitumi Clash, with a new icon set and installer artwork
- restyled the color palette from magenta to coral-pink and indigo

### Interface

- redesigned the UI for a compact window
- reworked the Home page with a subscription info grid and a live status log
- added live action progress tracking so long-running operations report their state
- added a Home button to sub-page headers
- collapsed the auto proxy grid to a single column when node names would otherwise truncate

### Behavior

- restricted global mode to nodes from your subscription
- added settings change detection with configurable tabs
- reworked Windows autostart and the elevated-task runner
- replaced the bundled auto-updater with a GitHub release check
- structured IPC errors and unified how errors are shown

### Fixes

- fixed the white screen on launch by pinning the Vite dev server to IPv4
- hardened startup, deep-link handling, and window layout

### Build & release

- regenerated the icon set and installer tooling under the Bitumi brand
- reworked the release pipeline for Windows-only builds
- removed the Telegram release notification integration
