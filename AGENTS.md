# AGENTS.md

Developer guide for **ClashApp** — an Electron desktop GUI for the [Mihomo](https://github.com/MetaCubeX/mihomo) proxy core. ClashApp is a visual fork of Koala Clash. `branding.json` is the single source of truth for app identity, which makes the app easy to re-skin (the `bitumi-clash` repo is a downstream overlay fork of this one).

> `CLAUDE.md` is a symlink to this file, so these notes also load as project instructions.

## Tech stack

- **Electron 37** + **React 19** + **TypeScript 5.9**
- **electron-vite 4** (Rolldown-based Vite) for bundling
- **Tailwind CSS 4**, Radix UI, Zustand (state), React Router 7, i18next (i18n), Monaco (YAML editing)
- **pnpm 10.33.0** — package manager, pinned in `packageManager`
- **Mihomo** core shipped as a sidecar binary under `extra/sidecar/`

## Prerequisites

- Node.js 20+
- pnpm 10+
- Git
- `corepack` (needed on Node.js 25+)

On Windows, `.\build_win.ps1` can bootstrap pnpm/corepack for you — skim it before running.

## Setup & development

```powershell
pnpm install        # installs deps; postinstall runs electron-builder install-app-deps
pnpm dev            # electron-vite dev server with hot reload
```

`pnpm install` triggers a `prepare` hook that downloads the Mihomo sidecar + geo data. For day-to-day dev that's automatic; for packaging you run it explicitly per-arch (`SKIP_PREPARE=1 pnpm install`, then `pnpm prepare --x64`) — see [docs/release-guide.md](docs/release-guide.md).

## Common commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run the app in dev mode (hot reload) |
| `pnpm build:win` / `build:mac` / `build:linux` | Production bundle + electron-builder package |
| `pnpm typecheck` | `typecheck:node` + `typecheck:web` (run before building) |
| `pnpm lint` | ESLint (flat config) with `--fix` |
| `pnpm format` | Prettier write across the repo |
| `pnpm prepare --<arch>` | Download sidecar/geo data for `x64` / `arm64` |
| `pnpm updater` | Generate `latest.yml` + changelog for a release |
| `.\build_win.ps1 [-Arch x64] [-Format nsis]` | Local Windows build mirroring CI |

## Project layout

```
src/
  main/        Electron main process (window, tray, IPC, Mihomo lifecycle, config)
  preload/     contextBridge preload scripts
  renderer/    React UI — 3 HTML entries: index.html, floating.html, traymenu.html
  shared/      Code shared across processes (incl. branding.ts)
build/         Icons + installer assets (nsis/, pkg-scripts/, linux/)
scripts/       prepare.mjs / updater.mjs / checksum.mjs (build & release tooling)
extra/sidecar/ Bundled Mihomo core
branding.json  Single source of truth for app identity
```

## Conventions

- **Prettier:** single quotes, no semicolons, `printWidth` 100, no trailing commas.
- **ESLint:** flat config (`eslint.config.cjs`), `@electron-toolkit` presets.
- **Path aliases:** `@renderer/*` → `src/renderer/src/*`, `@shared/*` → `src/shared/*`.
- Never hand-edit generated output (`out/`, `dist/`) or generated icons — regenerate icons from the SVG (see the fork guide).

## Working in this repo

These rules are load-bearing — follow them:

- **Branches:** do everyday work on `dev`. Branch `fix/<slug>` or `feat/<slug>` off `dev` for each change. `main` is **release-only** — a version bump pushed to `main` triggers the release build, so never push casual work there. PRs are **always squash-merged** (one commit per change). Full model: [docs/branching-workflow.md](docs/branching-workflow.md).
- **Committing:** when a unit of work is done, **write the commit message and commit immediately — do not ask "should I commit?"** Then ask the user: **"Should I push and create a pull-request?"** Message format: [docs/commit-messages.md](docs/commit-messages.md).
- **Don't** change `appId` or `productName` casually — it breaks installs and auto-updates ([docs/release-guide.md](docs/release-guide.md)).

## Documentation

- [docs/release-guide.md](docs/release-guide.md) — cut a release: bump the version on `main`, CI builds every platform and publishes the GitHub Release.
- [docs/branching-workflow.md](docs/branching-workflow.md) — the `main` / `dev` / `feat` / `fix` branch model and the commit → push → PR flow.
- [docs/commit-messages.md](docs/commit-messages.md) — the conventional `type(scope): summary` commit format and style to follow.
- [docs/forking-and-rebranding.md](docs/forking-and-rebranding.md) — fork & re-skin the app by editing `branding.json` and regenerating icons from one SVG.
- [docs/upstream-sync/README.md](docs/upstream-sync/README.md) — how a downstream fork keeps its `main` synced with this upstream via the overlay workflow.
