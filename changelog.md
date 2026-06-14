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
