# Task: Implement jeeves-meta v0.4.3

Implement the dev plan from the spec at `J:\domains\projects\jeeves-meta\spec.md`, section 9 ("Next Version: 0.4.3 (service) / 0.2.1 (plugin)"). Read that section in full before starting.

You are on branch `feature/v0_4_3-walk-and-health`. Work in phases as specified in the dev plan.

## Key Context

This repo is a monorepo with `packages/service` and `packages/openclaw`.

### What you're doing

1. **Phase 1 (Foundation):** Change CLI default service name from `'JeevesMeta'` to `'jeeves-meta'` (4 locations in `packages/service/src/cli.ts`). Add `walk(globs: string[]): Promise<string[]>` to the `WatcherClient` interface and implement in `HttpWatcherClient` (POST to `/walk` endpoint, return `paths` array from response).

2. **Phase 2 (Migrate to walk):** Replace all local filesystem walking and Qdrant scans with calls to `WatcherClient.walk()`:
   - `discoverMetas()` — replace `paginatedScan()` with `watcher.walk(["**/.meta/meta.json"])`
   - `getScopeFiles()` — replace `walkFiles(ownerPath)` with `await watcher.walk(["<ownerPath>/**"])`, make async
   - `getDeltaFiles()` — remove second `walkFiles()` call, reuse scope files from `getScopeFiles()`, filter by `fs.statSync(path).mtimeMs` locally
   - `buildContextPackage()` — make async
   - `orchestrate()` — await the async functions
   - `buildMinimalNode()` in `orchestrate.ts` — replace recursive `readdirSync` with `watcher.walk(["<ownerPath>/**/.meta/meta.json"])`, make async
   - Thread `watcher` client through to all functions that now need it

3. **Phase 3 (Dead code removal):** Delete `walkFiles.ts`, `paginatedScan.ts`. Remove `scan()`, `ScanFile`, `ScanParams`, `ScanResponse`, `unregisterRules()` from `WatcherClient` interface and `HttpWatcherClient`. Update all test mocks.

4. **Phase 4 (Health check):** Add `watcherHealthIntervalMs` to config schema (default 60000). Create periodic health check that pings watcher `/status`, compares uptime, re-registers rules on restart detection. Wire into startup/shutdown. Add `rulesRegistered` to `/status` response.

5. **Phase 5 (Plugin):** Update `promptInjection.ts` `StatusResponse` type to include `rulesRegistered?: boolean` on watcher dependency. Add warning when `rulesRegistered` is `false`.

6. **Phase 6:** Bump service to 0.4.3, plugin to 0.2.1. Run ALL quality gates.

## Engineering Rules

- **Zod schemas** for config — never bare TypeScript interfaces for config surfaces.
- **300 LOC hard limit** per file. Decompose if exceeded.
- **Test pairing** — every non-trivial module gets a `*.test.ts`.
- **No eslint-disable** — fix the code, don't suppress warnings.
- **TSDoc `@module`** on every non-test module.
- **All quality gates must pass** before considering work complete: `npm run build`, `npm run lint`, `npm run test`, `npm run typecheck`, `npm run knip`, `npm run docs` — zero errors AND zero warnings.
- **Commit at each phase boundary** with a descriptive message. Push after each commit.
- **Git auth:** Set `$env:GH_TOKEN = (Get-Content "J:\config\credentials\github\jgs-jeeves.token" -Raw).Trim()` before any git push.

## Glob Convention

- Discovery: `["**/.meta/meta.json"]` (relative, matches across all watch roots)
- Scope enumeration: `["<ownerPath>/**"]` (absolute path glob, e.g. `["j:/domains/email/**"]`)
- Child meta discovery: `["<ownerPath>/**/.meta/meta.json"]` (absolute)

## Single Walk Per Cycle

`getScopeFiles()` makes ONE `/walk` call. `getDeltaFiles()` and `structureHash` consume the same file list — no additional `/walk` calls. Delta filtering is local `fs.statSync`.

## WatcherClient Interface After This Work

Only two methods remain:
```typescript
registerRules(source: string, rules: InferenceRuleSpec[]): Promise<void>;
walk(globs: string[]): Promise<string[]>;
```

## Watcher `/walk` API

```
POST http://localhost:1936/walk
Body: { "globs": ["**/.meta/meta.json"] }
Response: { "paths": ["j:/domains/.../.meta/meta.json", ...], "matchedCount": 35, "scannedRoots": [...] }
```
