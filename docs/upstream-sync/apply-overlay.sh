#!/usr/bin/env bash
# Rebuild the working tree as "upstream tip + fork overlay", staged and ready to
# commit. This is the single source of truth for HOW the fork's identity is laid
# onto upstream; both the Sync Upstream workflow and the one-time bootstrap run it.
#
# Contract:
#   - CWD is the fork's git repo, currently on the `main` branch.
#   - The refs $UPSTREAM_REF (upstream tip) and $OVERLAY_REF (this overlay branch)
#     are already fetched.
#   - On return, every change is staged; the caller commits and (force-)pushes.
#
# The overlay does NO line-level merge: fork-owned files are copied whole and the
# fork's identity fields are overlaid onto upstream's package.json. branding.json
# drives every brand string in code/build, so there are no source patches here.
set -euo pipefail

# Keep `ref:path` arguments intact under Git Bash / MSYS (no-op elsewhere).
export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'

OVERLAY_REF="${OVERLAY_REF:-origin/bitumi-clash}"
UPSTREAM_REF="${UPSTREAM_REF:-upstream/main}"

# 1. Start from upstream's exact tree.
git reset --hard "$UPSTREAM_REF"

# 2. Lay fork-owned files on top. The copy set is exactly the `merge=ours` list in
#    the overlay branch's .gitattributes - the single source of truth. To add an
#    asset to the overlay, list it there.
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  git checkout "$OVERLAY_REF" -- "$pat"
done < <(git show "$OVERLAY_REF:.gitattributes" | sed 's/#.*//' | awk '/merge=ours/{print $1}')

# 3. Fork-only infra that must live on `main`: the sync workflow (scheduled runs
#    only fire from the default branch's copy) and .gitattributes (its merge=ours
#    drivers protect fork-owned files in any manual upstream merge).
git checkout "$OVERLAY_REF" -- .gitattributes
git checkout "$OVERLAY_REF" -- .github/workflows/sync-upstream.yml

# 4. package.json: upstream's, with only the fork identity fields overlaid. version
#    and everything else track upstream untouched. node (not jq) is used so this
#    runs the same locally and on the runner without extra tooling.
PIN_JSON="$(git show "$OVERLAY_REF:package.partial.json")"
node -e '
  const fs = require("fs")
  const pin = JSON.parse(process.argv[1])
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"))
  fs.writeFileSync("package.json", JSON.stringify({ ...pkg, ...pin }, null, 2) + "\n")
' "$PIN_JSON"

# 5. Stage everything for the caller to commit.
git add -A
