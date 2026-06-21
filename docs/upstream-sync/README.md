# Keeping a fork synced with upstream

This is how the downstream `bitumi-labs/bitumi-clash` fork tracks this repo (`kirisame-meguru/clashapp`) automatically — without merge conflicts or GitHub's "N commits behind" drift. The files in this folder are copyable templates; adapt them in your fork.

## The idea: rebuild `main` as "upstream tip + overlay"

A fork's only real differences are its **identity** (branding, icons, README, package fields). Instead of merging upstream into a diverged `main`, the fork keeps `main` disposable and **rebuilds** it on a schedule:

```
main  =  <upstream tip>  ←  <one "overlay" commit of fork identity>
```

Because the upstream tip is always an ancestor of `main`, GitHub shows **0 behind**, and there's no merge commit. The fork's customization lives on an **orphan overlay branch** (named after the fork, e.g. `bitumi-clash`) holding:

- `branding.json` — every brand string in code/build derives from it, so there are **no source patches**
- icons + the in-app logo, the fork's `README.md`, `resources/default-theme.css`, `src/renderer/src/assets/traymenu.css`
- `package.partial.json` — the fork's `package.json` identity fields
- `.gitattributes` — the `merge=ours` list that **is** the copy-set
- `.github/workflows/sync-upstream.yml` and `tools/apply-overlay.sh`

> `main` is machine-managed: a direct push to it is wiped on the next sync. Make fork changes on the overlay branch.

## How a sync runs

Every 6 hours (and on demand) the `Sync Upstream` workflow:

1. Fetches the upstream tip and the overlay branch.
2. Runs `apply-overlay.sh`, which: hard-resets the tree to the upstream tip → checks out every `merge=ours` path (plus `.gitattributes` and the sync workflow) from the overlay branch → overlays `package.partial.json` onto upstream's `package.json` with `node` → stages everything.
3. Commits the overlay and **force-pushes** `main`.

If the rebuilt tree is identical to what `main` already has, nothing is pushed.

## Releasing on a version bump

The downstream's own `build.yml` fires a release from a `push` to `main` when `package.json`'s version differs between `HEAD` and `HEAD~1`. A single overlay commit can't show that (its parent is the upstream tip, whose version already equals it). So when upstream's version changed, the overlay is laid down as **two commits**:

```
<upstream tip>  ←  <overlay @ OLD version>  ←  <bump to NEW version>   (main)
```

The tip is then a genuine version-bump commit whose tree already carries the fork branding — so the downstream's release build fires on exactly the branded commit, with no manual dispatch. When upstream's version is unchanged, a single overlay commit is pushed and no build fires.

## The push credential: `SYNC_TOKEN`

The rebuilt `main` can include upstream's edits to files under `.github/workflows/`. The built-in `GITHUB_TOKEN` is a GitHub App token and is **forbidden** from pushing workflow files, so that push is rejected. The workflow therefore pushes with **`SYNC_TOKEN`** — a PAT / fine-grained token carrying the `workflow` scope (store it in repo secrets). It falls back to `GITHUB_TOKEN` only for syncs that touch no workflow file. As a user credential, `SYNC_TOKEN`'s force-push is also what lets the push trigger fire the release build.

If a sync fails, the workflow opens a single tracking issue. Because it's a file-copy + field-overlay (not a line merge), failures mean a missing copy-set path, a renamed upstream `package.json` field, or `branding.json` drift — fix on the overlay branch and re-run.

## Adapting these templates to your fork

The files here are taken from the working `bitumi-clash` setup. To reuse them, change:

| Where | Change |
|---|---|
| `sync-upstream.yml` → `env.OVERLAY_BRANCH` | your overlay branch name |
| `sync-upstream.yml` → `env.UPSTREAM_REPO` / `UPSTREAM_BRANCH` | the repo/branch you fork from |
| `package.partial.json` | your `name` / `description` / `author` / `homepage` |
| `gitattributes.example` → `.gitattributes` | the exact set of fork-owned files to keep |
| `branding.json` (in your repo root) | your app identity |

Then create the orphan overlay branch with those files plus `apply-overlay.sh`, add `SYNC_TOKEN` to repo secrets, and run the workflow once manually.

## Files in this folder

| Template here | Goes to (in your fork) |
|---|---|
| `sync-upstream.yml` | `.github/workflows/sync-upstream.yml` |
| `apply-overlay.sh` | `tools/apply-overlay.sh` |
| `package.partial.json` | `package.partial.json` |
| `gitattributes.example` | `.gitattributes` |
