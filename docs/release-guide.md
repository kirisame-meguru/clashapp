# Release guide

How to build and publish a ClashApp release. The pipeline is `.github/workflows/build.yml`; local builds use `build_win.ps1`.

## Release model — bump the version on `main`

A normal release needs no manual workflow run. The `Build` workflow has a `push` trigger on `main` scoped to `package.json`; it compares the version at `HEAD` vs `HEAD~1` and, when it changed, builds the full matrix and publishes a GitHub Release.

1. Make sure `main` is up to date and green.
2. Bump the version and changelog:
   - `package.json` → `version`: plain semver, **no leading `v`** (`1.2.1`, not `v1.2.1`, not `1.2.1-beta`).
   - `changelog.md` → add a section titled with the same version, e.g. `## 1.2.1`.
3. Commit and push to `main`:
   ```powershell
   git add package.json changelog.md
   git commit -m "chore(release): bump version to 1.2.1"
   git push origin main
   ```
4. The workflow detects the bump, runs the build matrix, and the `release` job publishes a GitHub Release tagged `1.2.1` with `latest.yml` and all installers attached.

On next launch the app checks `releases/latest` for `branding.updateRepo`, sees the new version, and prompts users to update.

## Build matrix

One run fans out to (defined in `build.yml`):

- **Windows** x64 + arm64 × `nsis` (installer) and `7z` (portable)
- **Linux** x64 + arm64 × `deb`, `rpm`, `pacman`
- **macOS** x64 + arm64 (`pkg`; signed + notarized only when the `APPLE_*` secrets exist, otherwise unsigned)

Artifact names derive from `branding.productName` (e.g. `ClashApp_x64-setup.exe`, `ClashApp_x64-portable.7z`).

## Other workflow triggers

- **Manual dispatch with a version** (`Actions → Build → Run workflow`, type `1.2.1`) — cuts a real release without a version-bump commit. Use this if the push trigger didn't fire.
- **Manual dispatch with empty version** — publishes a rolling `pre-release` beta (`<next>-beta-<hash>`).
- **Nightly cron (18:00 UTC)** — builds from `dev` and moves the `nightly` pre-release tag, but only when `dev` has new commits since the last nightly.

## Local build (verify before releasing)

```powershell
pnpm typecheck
.\build_win.ps1                 # x64 NSIS by default; -Arch arm64, -Format 7z|all
```

Equivalent low-level form (what `build_win.ps1` and CI run):

```powershell
$env:SKIP_PREPARE='1'; pnpm install; Remove-Item Env:SKIP_PREPARE
pnpm prepare --x64
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
pnpm build:win -- --x64
```

Output lands in `dist/` (`ClashApp_x64-setup.exe`, `ClashApp_x64-portable.7z`). Test the installer as a clean upgrade over the previous version — user data lives in `app.getPath('userData')`, so subscriptions/settings must survive the update.

## Manual release (if Actions is unavailable)

If GitHub Actions is blocked (e.g. billing):

1. Build locally (above).
2. Generate the update manifest: `pnpm updater` → writes `latest.yml`.
3. `Releases → Draft a new release`:
   - **Tag / Title:** the version without `v` (e.g. `1.2.1`); **Target:** `main`.
   - **Description:** the `changelog.md` section.
   - **Assets:** `latest.yml` + everything in `dist/`.
4. Publish. The app finds the new version through the GitHub Releases API.

## Safe-update rules

- Don't change `appId` or `productName` (in `branding.json`) — Windows would treat it as a different product, and install paths/names would shift.
- Don't drop migrations or wipe the `userData` folder — it holds users' subscriptions and settings.
- Publish only to `branding.updateRepo` (currently `kirisame-meguru/clashapp`) — the update check looks there specifically.
- For public releases use a plain version (`1.2.1`), not a pre-release suffix.
