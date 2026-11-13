# AGENTS.md — Standing Rules for feature/234-catalog-sdk

This file is a standing contract for any agent (human-directed or autonomous) working on
`feature/234-catalog-sdk` (jeeves-meta spec §4, issues #234, #243, #240, #244).

## Authority

- `J:\domains\projects\jeeves-meta\spec.md` §4 is the authority. It is locked; do not
  reverse any owner decision in §4.5. If a decision looks wrong, stop and report instead
  of overriding it.
- Tasks T1–T14 (§4.6) run in order, one at a time.
- One branch, `feature/234-catalog-sdk`, one PR, closing #234, #243, #240, #244.

## Commits

- Every commit message starts with `[234] ` followed by a conventional-commit type
  (e.g. `[234] feat: ...`, `[234] test: ...`, `[234] docs: ...`).
- Breaking commits carry a `BREAKING CHANGE:` footer pointing at
  `packages/service/guides/migrating-to-0.20.md`.
- Commit AND push immediately after every commit. No force-push.

## Lint and Tests

- Never use `eslint-disable` in production code.
- In tests only, `eslint-disable-next-line <rule> -- <why>` is allowed when truly
  unavoidable, and every such line must be listed in the PR description.
- No lint `ignores` entries and no rules turned off for tests.
- No trivial tests. Every new module gets coverage. A test must fail if the behaviour
  it covers breaks (mutation-style check).

## Before Every Push

- Run all gates at the repo root and in every touched package, with zero errors and
  zero warnings: `build`, `typecheck`, `lint`, `knip`, `test`, and
  `npx prettier --check .`.
- Check `gh pr list --head <branch> --repo karmaniverous/jeeves-meta --json number,state`:
  it must show the PR `OPEN`, or no PR yet. Never push to a merged/closed PR branch.

## Docs

- README, guides and SKILL docs change in the same task as the code they describe,
  never as a separate follow-up.

## Code Shape

- Files stay at or under 300 lines.
- SOLID/DRY.
- Schema-first Zod: schemas define the shape; types are derived from them.

## Dependencies

- New runtime dependencies are only those named in the spec, pinned exact or caret
  exactly as the spec specifies.
