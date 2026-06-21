# Commit message style

The commit convention for this repo. Write messages yourself in this format; the `git-commit-writer` agent follows the same rules. The existing `git log` is the reference — e.g. `feat(settings,subscription-headers): add x-clashapp-show-usage-stats header`.

## Workflow

1. Inspect the staged diff first: `git diff --cached`.
2. If nothing is staged, fall back to `git diff HEAD` for all uncommitted changes.
3. Optionally check tone/style with `git log --oneline -5`.
4. Identify what changed, why it likely changed, and which modules are affected — then write the message.

## Format

```
<type>(<optional scope>): <short imperative summary, max 72 chars>

- <one-line change 1>
- <one-line change 2>
- <one-line change 3>
```

## Rules

- **Subject:** imperative mood ("add", "fix", "remove" — not "added" / "fixes"), ≤ 72 chars, no trailing period.
- **Type:** one of `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`, `ci`, `build`, `revert`.
- **Scope:** optional; the module/area affected (e.g. `theme`, `settings`, `elevation`, `global-mode`).
- **Body bullets:** one concise line per discrete change. No sub-bullets, no paragraphs. Omit obvious or trivial detail.
- **Omit the body entirely** when the subject fully captures the change (e.g. a one-line typo fix).
- **Don't** include file paths unless the path itself is meaningful (e.g. a config filename).

## Style

- Write like a developer: terse, direct, no filler.
- Avoid "This commit…", "Updated the…", "Changed some…".
- Prefer specifics: "add JWT refresh token rotation" over "improve auth".
- If a diff touches many unrelated concerns, note it and suggest splitting into multiple commits — but still provide a best-effort single message.

## Edge cases

- **Empty diff:** report that no changes are detected; ask to stage files.
- **Only lock/binary files changed:** note that only non-semantic files changed; ask whether accompanying source changes are missing.
- **Ambiguous intent:** make a reasonable inference from the code; don't ask for clarification unless the diff is truly uninterpretable.
