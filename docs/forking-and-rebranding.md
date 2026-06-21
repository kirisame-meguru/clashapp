# Forking & rebranding

How to fork ClashApp and ship it under your own name. Almost everything flows from one file: **`branding.json`**.

## `branding.json` — single source of truth

```json
{
  "appId": "com.clashapp.app",
  "productName": "ClashApp",
  "appName": "ClashApp",
  "packageName": "clashapp",
  "protocolScheme": "clashapp",
  "protocolName": "ClashApp URI Scheme",
  "userAgentProduct": "clashapp",
  "updateUserAgent": "ClashApp",
  "updateRepo": "kirisame-meguru/clashapp"
}
```

| Field | Drives |
|---|---|
| `appId` | electron-builder app id (reverse-DNS, unique per OS). Changing it makes the OS treat the app as a different product. |
| `productName` | Installer/app display name, install path, artifact filenames (spaces → dots, e.g. `My.App_x64-setup.exe`), and the `userData` folder name. |
| `appName` | Window titles and the system app menu. |
| `packageName` | Executable name, Windows scheduled-task names, scripts (lowercase, no spaces). |
| `protocolScheme` | Deep-link scheme — `clashapp://install-config?...`. |
| `protocolName` | Human-readable protocol name shown in OS URI handlers. |
| `userAgentProduct` | `User-Agent` product token when fetching profiles (`clashapp/1.0.5`). |
| `updateUserAgent` | Product name sent on update-check requests. |
| `updateRepo` | `owner/repo` used for releases and update checks. |

It cascades automatically into:

- **`electron-builder.config.cjs`** — `appId`, `productName`, artifact names, and a generated `build/nsis/branding.nsh` (scheduled-task names from `packageName`).
- **`electron.vite.config.ts`** — injects window titles into the `%RENDERER_TITLE%` placeholder in the renderer HTML.
- **`src/shared/branding.ts`** — exposes the fields to app code, plus `repoUrl`, `deepLinkPrefix`, `deepLinkPattern`.
- **Installer script templates** — `@@APP_NAME@@` in `build/pkg-scripts/*` (macOS) and `build/linux/postinst` is replaced with `productName` at build time.

So a rebrand is mostly: **edit `branding.json`, rebuild.**

## Icons — one SVG, generated outputs

The single source is `resources/app_icon_source.svg`. Don't hand-edit the generated raster / `.ico` / `.icns` files — regenerate them:

```powershell
.\make_icons.ps1     # requires ImageMagick v7 ("magick" on PATH)
```

It regenerates, all from the SVG:

- `src/renderer/src/assets/app-logo.png` (512), `build/icon.png`, `resources/icon.png`, `resources/icon_off.png` (512)
- `resources/icon_on_mac.png`, `resources/icon_off_mac.png` (80)
- `resources/icon.ico`, `build/icon.ico` (16–256), `resources/icon_off.ico` (16–256 + 128)
- `build/icon.icns` (16–1024)
- `build/installerIcon.ico` — the logo composited behind the cardboard-box template `build/installerIcon_template.png`

## Default theme (optional)

`resources/default-theme.css` is empty upstream. A fork can replace it with `:root` / `.dark` CSS-variable overrides to bake a default skin into the build — no `custom-css` subscription header needed. This is exactly what the `bitumi-clash` overlay ships for its purple/coral look (it also pins `src/renderer/src/assets/traymenu.css`, which the in-app theme injection doesn't reach).

## Rebrand checklist

1. Edit **`branding.json`** (all fields → your identity).
2. Replace **`resources/app_icon_source.svg`**, then run **`.\make_icons.ps1`**.
3. Update **`package.json`** `name` / `description`.
4. Point **`updateRepo`** at your repo and set up your own Releases.
5. *(optional)* Ship a default theme via `resources/default-theme.css`.
6. *(optional)* Rename the `x-clashapp-*` subscription response headers (parsed in `src/main/config/profile.ts`) to your own prefix.
7. Build (`.\build_win.ps1`) and verify the installer, window titles, deep links, and update check.

## Staying in sync with upstream

If your fork tracks this repo, automate it with the overlay workflow rather than manual merges — see [upstream-sync/README.md](upstream-sync/README.md).
