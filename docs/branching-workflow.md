# Branching workflow

How branches and commits work in this repo. **This is an instruction — follow it when doing any work here.**

## Branches

- **`main` — release-only.** It receives the version-bump commit and CI's own pushes (the `release` job's version commit, the moved `nightly` tag). A push to `main` that changes `package.json`'s `version` triggers the release build (see [release-guide.md](release-guide.md)). **Never push everyday work to `main`.**
- **`dev` — integration.** The default base for everyday work, and the source of nightly builds.
- **`feat/<slug>`, `fix/<slug>`** (also `chore/`, `docs/`, `refactor/`) — short-lived branches off `dev`, one per change.

## The flow

1. **Branch off `dev`:**
   ```powershell
   git switch dev
   git switch -c fix/tray-icon-flicker
   ```
2. **Do the work.**
3. **Commit immediately — do not ask "should I commit?"** Write the message yourself per [commit-messages.md](commit-messages.md), then commit:
   ```powershell
   git add -A
   git commit -m "fix(tray): stop icon flicker on theme switch"
   ```
4. **Then ask the user, verbatim: "Should I push and create a pull-request?"**
5. On yes, push the branch and open a PR into `dev`:
   ```powershell
   git push -u origin fix/tray-icon-flicker
   gh pr create --base dev --fill
   ```

## Merging pull requests

**Always squash-merge.** Every PR lands on its base branch as a single commit, keeping `dev` and `main` history linear — one commit per change. Don't use merge commits or rebase-merge.

```powershell
gh pr merge --squash --delete-branch
```

Lock it in under GitHub → Settings → General → Pull Requests: enable **Allow squash merging** only, and disable merge commits + rebase merging so nothing else is possible.

## Releasing

Changes accumulate on `dev`. When ready to ship, bump the version on `main` — that's the only thing that goes directly onto `main`, and it triggers the release. See [release-guide.md](release-guide.md).
