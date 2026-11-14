# AGENTS.md

Standing rules for any agent working in this repository.

## Authority

- The jeeves-meta product spec is the authority for design. Its Next Version section, once locked, lists the tasks in order; do them one at a time on one branch with one PR.
- Never reverse an owner decision recorded in the spec. If one looks wrong, stop and report.

## Commits

- Every commit message starts with the branch's issue prefix (for example `[234] `) followed by a conventional-commit type: `[234] feat(service): ...`.
- Breaking commits carry a `BREAKING CHANGE:` footer that points at the migration guide.
- Commit and push immediately after every commit. Never force-push.

## Lint and Tests

- Never use `eslint-disable` in production code.
- In tests only, `eslint-disable-next-line <rule> -- <why>` is allowed when the test cannot be written another way; list every such line in the PR description.
- No lint `ignores` and no rules turned off for tests.
- No trivial tests. Every new module is covered, and a test must fail if the behaviour it covers breaks.

## Before Every Push

- Run every gate at the root and in each touched package, with zero errors and zero warnings: `build`, `typecheck`, `lint`, `knip`, `test`, and `npx prettier --check .`.
- Run `gh pr list --head <branch> --repo karmaniverous/jeeves-meta --json number,state`. Push only if the PR is `OPEN` or there is no PR yet.

## Docs

- README, guides and skill docs change in the same commit series as the code they describe.

## Code Shape

- Files stay at or under 300 lines.
- SOLID and DRY.
- Schema-first Zod: schemas define shapes; types derive from them.

## Dependencies

- Add only the runtime dependencies the spec names, with the range the spec gives.

## Wire Baseline

- `packages/service/src/test/wire/wire-0.19.0.json` records what service 0.19.0 sends for every scenario in `src/test/wire/scenarios.ts`; `src/api/wireBaseline.test.ts` replays them. A changed reply must be listed in `src/test/wire/departures.ts`.
- Re-record the baseline from the release itself with `npm run wire:capture` (in `packages/service`), never by hand.
