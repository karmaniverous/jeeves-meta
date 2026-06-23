# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 🐛 Bug Fixes

- Batch fixes #179, #184, #194, #199, #200
- Normalize .meta suffix in queue path comparisons
## [0.16.0] - 2026-06-17

### 🚀 Features

- Delegate subagent timeout to gateway lifecycle (#197)

### 💼 Other

- Updated core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.16.0
## [0.15.12] - 2026-06-13

### 🚀 Features

- V0.16.0 bug fixes and enhancements (#174, #175, #176, #177, #181, #182, #183, #186, #189)

### 🐛 Bug Fixes

- Address copilot review comments

### 🚜 Refactor

- Extract empty-scope helpers and cycle token computation (DRY/SRP)

### 🧪 Testing

- Add coverage for v0.16.0 changes (17 new tests)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.12
## [0.15.11] - 2026-06-11

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.11
## [0.15.10] - 2026-05-30

### 🐛 Bug Fixes

- Defer synthesis_start until phase actually executes (#165)
- Externalize @karmaniverous/jeeves across service and openclaw packages (#167)
- Delta-aware child meta filtering in context package (#169)
- Distinguish unsynthesized delta children from non-delta (null vs undefined)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.10
## [0.15.9] - 2026-05-29

### 🚀 Features

- *(service)* Add file logging support (#153)
- *(service)* AutoSeed parentDepth option (#152)
- Per-entity timeout overrides for synthesis phases (#122)
- *(service)* Inject ancestor meta context into synthesis (#158)
- *(service)* Emit ANNOUNCE_SKIP from synthesis workers (#148)

### 🐛 Bug Fixes

- *(service)* Periodic virtual rule re-registration (#117)
- *(service)* Prompt resolution and soft invalidation (#159)
- *(service)* Recompute invalidation on targeted trigger (#160)
- Address Gemini review — remove redundant register, reset 503 counter, eliminate meta mutation (#161)
- Decouple prompt staleness from invalidation cascade (#163)
- Lint errors and full docs sync with implementation
- Resolve export sort after merge of docs-sync branch

### 💼 Other

- Updated core dependency
- Lintfix
- Updated core
- Fix

### 🚜 Refactor

- *(core)* Shared endpoint catalog (#150)
- SOLID/DRY pass — extract helpers, fix endpoint semantics, derive schema keys
- *(service)* Simplify trigger persist — match scheduler Tier 2 pattern (#160)
- DRY pass — deduplicate invalidation result and preview logic
- Consolidate structureHash, add firstRun invalidator, remove dead scopeMtimeMax

### 📚 Documentation

- Remove ghost module references from orchestration guide

### 🧪 Testing

- Add ANNOUNCE_SKIP sentinel stripping coverage (#148)
- *(phaseState)* Add dedicated computeInvalidation coverage (#160)
- Strengthen invalidation coverage — criticChanged, prompt fallback, trivial assertion

### ⚙️ Miscellaneous Tasks

- Update dependencies (jeeves-core 0.5.11, vitest 4.1.7, dotenvx 1.69.1)
- Release @karmaniverous/jeeves-meta v0.15.9
## [0.15.8] - 2026-05-23

### 🐛 Bug Fixes

- Wire Tier 2 invalidation loop into scheduler (fixes #156)
- Add configurable tier2ScanLimit, move cache invalidation outside loop

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.8
## [0.15.7] - 2026-05-22

### 🐛 Bug Fixes

- Wire Tier 2 invalidation into scheduling path (fixes #154)
- Use getOwedPhase for Tier 2 change detection, remove redundant hash calc

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.7
## [0.15.6] - 2026-05-16

### 🐛 Bug Fixes

- Pin jeeves-meta-core dependency to ^0.1.1

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.6
## [0.15.5] - 2026-05-13

### 🚀 Features

- Phase 10 bundle — core package, git-cliff, contracts.tools, cleanup

### 🚜 Refactor

- Hoist shared types and constants to core package for DRY
- Simplify GatewayExecutor details cast per review

### ⚙️ Miscellaneous Tasks

- Move changelog generation to after:bump hook
- Bump deps, standardize rollup build, align with jeeves-server
- Release @karmaniverous/jeeves-meta v0.15.5
## [0.15.4] - 2026-05-05

### 🐛 Bug Fixes

- Add Fastify global request timeout (#133)
- Detect completed sessions via sessions_list in GatewayExecutor polling (#141)
- Startup readiness gate and heartbeat timeout (#131, #130)
- Skip architect invalidation on structure change for progressive metas, add large-scope sampling (#135)
- Apply Tier 1 cheap invalidation at tick time (#139)
- Replace legacy staleness selector with phase-state scheduler in routes (#137)
- Raise sessions_list limit and gate cache invalidation on execution

### 🚜 Refactor

- [**breaking**] Remove legacy orchestration path (#138)
- SOLID/DRY pass across 0.16.0 touched code

### ⚡ Performance

- Cache listMetas result with 60s TTL (#132)

### 🧪 Testing

- Improve coverage for 0.16.0 touched code

### ⚙️ Miscellaneous Tasks

- Add npm publish safety net (.npmignore + gitignore *.local)
- Remove dead meta-config rule (#116)
- Convert rollup configs from mjs to ts (#103)
- Release @karmaniverous/jeeves-meta v0.15.4
## [0.15.3] - 2026-05-03

### 🐛 Bug Fixes

- Instruct sub-agent to reply NO_REPLY instead of file path\n\nThe GatewayExecutor spawns sub-agent sessions for each synthesis phase.\nPreviously the task told the sub-agent to reply with the output file path,\nwhich leaked to the parent chat channel (user DMs). The executor\nalready reads output from the staged file on disk, so the chat reply\nserved no purpose.\n\nChange the OUTPUT DELIVERY instruction to reply with NO_REPLY, which\nOpenClaw treats as a silent acknowledgment and does not surface to chat.

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.3
## [0.15.2] - 2026-04-22

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.2
## [0.15.1] - 2026-04-17

### 🐛 Bug Fixes

- Drop synthetic parent sessionKey from GatewayExecutor — spawn statelessly like runner

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.1
## [0.15.0] - 2026-04-17

### 🚀 Features

- Add phase-state machine foundation (Tasks #1-6, #11-13d)
- Rewrite scheduler for phase-aware tick and fix _synthesisCount
- Wire bootstrap to phase-state machine and override queue processing
- Wire phase-state orchestration into bootstrap + queue (Tasks #7-10)

### 🐛 Bug Fixes

- Resolve all verification gaps — queue automatic layer, abort _error, skipUnchanged bump, integration tests, e2e test, minor gaps
- Prevent abort race condition — runPhase skips persist when executor.aborted
- Address PR #126 review comments — wire currentPhase, remove redundant reads, use shared helpers

### 🚜 Refactor

- Extract shared test fixtures and fix mock shapes in route tests

### 📚 Documentation

- Update service README for phase-state machine
- Update guides and changelogs for phase-state machine (Tasks #19a-19h)

### 🎨 Styling

- Fix lint formatting — prettier and import sort

### 🧪 Testing

- Add phase-state integration tests (Tasks #14-18)
- Strengthen test suite — add missing coverage and fix weak assertions

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.15.0
## [0.14.0] - 2026-04-16

### 🚀 Features

- Add _disabled flag and meta_update tool (#123, #124)

### 🚜 Refactor

- PATCH route uses resolveMetaDir instead of full listMetas walk

### 📚 Documentation

- Update READMEs and skill for meta_update tool and _disabled flag

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.14.0
## [0.13.11] - 2026-04-15

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.11
## [0.13.10] - 2026-04-13

### 🐛 Bug Fixes

- Normalize owner paths in /synthesize route (#120)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.10
## [0.13.9] - 2026-04-13

### 🚀 Features

- Add H1 identification header and phase-specific labels to synthesis sessions

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.9
## [0.13.8] - 2026-04-12

### 🐛 Bug Fixes

- Isolate gateway invoke session per synthesis

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.8
## [0.13.7] - 2026-04-08

### 🐛 Bug Fixes

- Resolve 5 bugs (#112, #113, #114, #111, #104)
- Address PR review feedback

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.7
## [0.13.6] - 2026-04-08

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.6
## [0.13.5] - 2026-04-05

### 💼 Other

- Unhoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.5
## [0.13.4] - 2026-04-05

### 💼 Other

- Hoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.4
## [0.13.3] - 2026-04-05

### 🐛 Bug Fixes

- Consume core importMetaUrl, remove stale rollup configs, handle watcher 503 (fixes #109, #103, #102)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.3
## [0.13.2] - 2026-04-05

### 🐛 Bug Fixes

- Correct prompt file paths for rollup bundle (fixes #107)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.2
## [0.13.1] - 2026-04-05

### ⚙️ Miscellaneous Tasks

- Update dependencies (jeeves 0.5.3, eslint, vitest, rollup, etc.)
- Release @karmaniverous/jeeves-meta v0.13.1
## [0.13.0] - 2026-04-03

### 🚀 Features

- Bump @karmaniverous/jeeves to ^0.5.1, Node >=22 (M1, M2)

### 🐛 Bug Fixes

- Meta-config rule glob matches both legacy and canonical config paths (H1)
- CLI commands use core getServiceUrl instead of hardcoded URL (H3)
- Use URL constructor for apiUrl, fix import sort in listMetas

### 💼 Other

- Remove dead host config field, getBindAddress() handles binding (H2)

### 🚜 Refactor

- Export MAX_STALENESS_SECONDS and reuse in listMetas
- Replace local sleep with core sleepAsync, remove sleep.ts

### 📚 Documentation

- Refresh READMEs for canonical config path and current tool surface
- Fix guide asset paths, update meta-config match and remove host
- Export MAX_STALENESS_SECONDS so typedoc link resolves
- Sync all guides, skills, and READMEs with implementation

### 🎨 Styling

- Fix prettier formatting on meta-config glob

### 🧪 Testing

- Update service tests for host field removal
- Add tests for apiUrl helper and GatewayExecutor (spawn, timeout, abort)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.13.0
## [0.12.4] - 2026-04-01

### 🐛 Bug Fixes

- Exclude .meta/ from isStale() mtime check (fixes #95)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.12.4
## [0.12.3] - 2026-03-31

### ⚙️ Miscellaneous Tasks

- Resolve merge conflicts with main, bump core to ^0.4.6
- Release @karmaniverous/jeeves-meta v0.12.3
## [0.12.2] - 2026-03-30

### 🚀 Features

- Integrate core 0.4.5 — add descriptor.run, fix start recursion

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.12.2
## [0.12.1] - 2026-03-30

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.12.1
## [0.12.0] - 2026-03-30

### 🚀 Features

- Phase 1 — config migration, descriptor, bind address (M1, M2, M6)
- Phase 2 — config apply, status handler, queue management, archive watcher scan (M5, M5b, M7c)
- Phase 3 — service CLI + plugin toolset + plugin CLI (M3, M4, M7, M7b)
- Integrate core 0.4.5 — add descriptor.run, fix start recursion

### 🐛 Bug Fixes

- Correct startCommand path in descriptor (dist/cli.js → dist/cli/jeeves-meta/index.js)

### 🚜 Refactor

- Tighten SOLID and DRY in service routes

### 📚 Documentation

- Sync tools, guides, and READMEs with implementation
- Add front matter to guides (title + children pattern from jeeves-server)

### 🧪 Testing

- Add configHotReload coverage (12 tests)

### ⚙️ Miscellaneous Tasks

- Update dependencies — core ^0.4.4 (Zod 4), ESLint 10, knip 6, typedoc 0.28.18, typescript-eslint 8.57.2
- Integrate core 0.4.6 — remove init() workaround from descriptor.run
- Release @karmaniverous/jeeves-meta v0.12.0
## [0.11.3] - 2026-03-28

### 🐛 Bug Fixes

- Use path.posix.dirname on normalized paths for Linux compatibility
- Use character-class glob escaping instead of backslash escaping for Windows compatibility

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.11.3
## [0.11.2] - 2026-03-25

### 🐛 Bug Fixes

- Use character-class glob escaping instead of backslash (Windows-compatible)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.11.2
## [0.11.1] - 2026-03-25

### 🐛 Bug Fixes

- Escape glob metacharacters in watcher walk paths, suppress completion for skipped entities, bump _generatedAt on empty-scope skip
- Use lock-staged write for empty-scope _generatedAt bump

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.11.1
## [0.11.0] - 2026-03-25

### 🚀 Features

- Differentiate STARTED (directory) and COMPLETED (meta.json) links in progress reports, add URL encoding
- Update timeout defaults to 180/360/240 based on operational data

### 🐛 Bug Fixes

- Pass phase to error progress events, skip empty-scope entities with no prior content

### ⚙️ Miscellaneous Tasks

- Remove stray rollup temp file
- Release @karmaniverous/jeeves-meta v0.11.0
## [0.10.1] - 2026-03-25

### 🚀 Features

- Handlebars template compilation for prompts, progressive synthesis guidance (#77)
- Ship built-in default prompts, make defaultArchitect/defaultCritic optional in config

### 🐛 Bug Fixes

- Normalize watcher walk paths in getScopeFiles (#77)
- Externalize handlebars in rollup config
- Flatten CLI prompt copy dest to match import.meta.url resolution

### 💼 Other

- Lintfix

### 📚 Documentation

- Sync all docs with built-in prompts, optional config, Handlebars templates

### 🧪 Testing

- Cover Handlebars escaping and template resolution in prompt builders

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.10.1
## [0.10.0] - 2026-03-24

### 🚀 Features

- Thread pino logger through synthesis pipeline (#27)
- Convert orchestrator and route file I/O to async (#71)
- Link to meta.json in progress reports, support insider links (#37)
- Auto-generate _id on first synthesis, expand config hot-reload (#38, #32)
- Auto-seed policy with config-driven declarative meta creation (#72)
- Post-registration virtual rule verification (#36)

### 🐛 Bug Fixes

- NeverSynthesized filter checks lastSynthesized instead of Infinity
- MinimalLogger.warn signature in verify.ts (requires obj + msg args)

### 🚜 Refactor

- Extract shared seed logic from route handler
- SOLID/DRY cleanup — extract summary, reduce duplication, async route handlers
- Address Gemini review — parallel prune, idiomatic dirname, clarify hot-reload

### 📚 Documentation

- Update all documentation to reflect v0.10.0 features (autoSeed, hot-reload, _id auto-gen)

### 🧪 Testing

- Add missing tests for computeSummary, routes (metas list, preview, status, unlock, synthesize)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.10.0
## [0.9.0] - 2026-03-23

### 🚀 Features

- Add _crossRefs support (Phase 1, issue #63)

### 🚜 Refactor

- DRY extraction for meta content reading and prompt section rendering

### 📚 Documentation

- Update READMEs and consumer skill for _crossRefs
- Update guides for _crossRefs (tools-reference, concepts)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.9.0
## [0.8.0] - 2026-03-22

### 🐛 Bug Fixes

- Upgrade @karmaniverous/jeeves to ^0.3.0 and trim TOOLS.md meta section (#67)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.8.0
## [0.7.0] - 2026-03-22

### 🚀 Features

- *(service)* Phase 2 - progressive state, timeout recovery, GET /config

### 🐛 Bug Fixes

- *(service)* Persist builder error to meta.json on non-timeout failure
- Standardise bind address, plugin configSchema naming, and defaults (#65)

### 🚜 Refactor

- SOLID/DRY pass — extract finalizeCycle, deduplicate PLUGIN_ID and tool registration
- *(service)* Rename CLI validate command to config with alias

### 📚 Documentation

- Update skills, READMEs for v0.7.0 — 7 tools, _state, GET /config
- Sync all guides and READMEs with v0.7.0 implementation

### 🧪 Testing

- *(service)* Add 400 test for GET /config with invalid JSONPath
- *(service)* Add unit tests for finalizeCycle and timeoutRecovery

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.7.0
## [0.6.1] - 2026-03-19

### 🐛 Bug Fixes

- *(service)* Use unique session labels to prevent 'label already in use' errors
- *(service)* Gateway health probe path /api/status -> /status

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.6.1
## [0.6.0] - 2026-03-18

### 🐛 Bug Fixes

- Add tagPrefix to auto-changelog config for monorepo tags
- Surface watcher indexing state in /status, fix rulesRegistered false-negative (#43)

### 📚 Documentation

- Full documentation pass — PlantUML diagrams, sync with implementation

### ⚙️ Miscellaneous Tasks

- Fix all knip errors
- Update dependencies via ncu
- Release @karmaniverous/jeeves-meta v0.6.0
## [0.5.0] - 2026-03-15

### 🐛 Bug Fixes

- Don't persist default prompts in _architect/_critic fields
- Exclude json and file blobs from meta-current frontmatter rendering
- Architect output must be plain markdown, not JSON; defensive parser for unwrapping

### 💼 Other

- Phase 1: Foundation changes for v0.4.3 migration

- Change CLI default service name from 'JeevesMeta' to 'jeeves-meta'
- Add walk(globs: string[]): Promise<string[]> to WatcherClient interface
- Implement walk() method in HttpWatcherClient (POST to /walk endpoint)
- Add development task specification

Co-Authored-By: Claude Sonnet 4 <noreply@anthropic.com>
- Phase 1 + 2: Migration to watcher walk
- Phase 3: Dead code removal - drop scan, unregisterRules, walkFiles, paginatedScan
- Phase 4: Periodic watcher health check with rulesRegistered in /status
- Phase 5: Plugin rulesRegistered warning + cleanup stale exports
- Phase 6: Quality gate fixes - lint, typecheck, dead code cleanup
- Close review gaps: health check tests, plugin promptInjection tests, skill updates, stale JSDoc, spec isStale entry
- Extract mtime filter, remove unused node param from getDeltaFiles, fix stale JSDoc, remove TASK.md
- Extract buildMinimalNode to discovery module, reduce orchestrate.ts by 55 lines
- Extract readMetaJson utility, eliminate 5 duplicated JSON.parse(readFileSync) patterns
- Test coverage: add tests for buildMinimalNode, scope, mtimeFilter, readMetaJson, structureHash; fix scheduler mock
- Remove unused buildMinimalNode re-export from discovery index
- Update READMEs, guides, comments to reflect walk-based discovery and health check
- Add retry exhaustion and 429 tests for HttpWatcherClient.walk (Gemini review)

### 🚜 Refactor

- Use package-directory for version resolution instead of manual walk

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.5.0
## [0.4.2] - 2026-03-12

### 🐛 Bug Fixes

- Replace hardcoded version, workspace path, and port constants (#29)
- Exclude _* properties from meta-current frontmatter rendering

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.4.2
## [0.4.1] - 2026-03-12

### 🚀 Features

- File-based output staging, simplified progress messages
- Hybrid scan — filesystem walks for scope/delta/staleness, watcher for discovery (#28)
- Use glob frontmatter pattern for meta-current virtual rule
- Thread logger through synthesis pipeline (#27)
- Instruct builder to use PlantUML instead of ASCII art diagrams

### 🐛 Bug Fixes

- Fastify 5 logger — use loggerInstance instead of logger
- Watcher client timeout + executor content block parsing
- /status should be fast (remove expensive listMetas scan)
- Double-lock when targetPath matches stalest candidate
- Increase watcher client timeout to 30s
- Bound staleness for never-synthesized metas (Infinity → 1 year)
- Fetch token usage from session metadata, not message history
- Strict builder JSON prompt + robust multi-strategy parser
- Use human-readable generated_at in frontmatter
- Progress events use ownerPath, pretty-print token counts
- Generic output delivery instruction for all synthesis phases
- Strip .meta from progress paths at queue consumer level

### ⚡ Performance

- Skip full discovery scan for targeted synthesis

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta v0.4.1
## [0.4.0] - 2026-03-11

### 🚀 Features

- Scaffold packages/service (Phase 1)
- Port all lib core modules to service (Phase 2)
- HTTP API route handlers (Phase 3)
- Synthesis queue (Phase 4)
- Croner-based scheduler (Phase 5)
- Progress reporter (Phase 7)
- Virtual rule registration + graceful shutdown (Phases 6 & 8)
- CLI completion (Phase 9)
- Wire service bootstrap + integration plumbing (Phase 11)
- Per-phase progress callbacks + lock staging, lib fully decoupled

### 🐛 Bug Fixes

- Revert @module tag cleanup, add tsdoc.json to service package
- Resolve all spec gaps — wire real data into routes, scheduler, status
- Resolve all 13 spec conformance gaps
- Resolve 11 spec conformance gaps (A-K)
- Path convention consistency, CLI service start, dependency health reporting
- Synthesis_complete event now includes cumulative tokens
- ProgressReporter uses shared config ref for reportChannel hot-reload
- ProgressReporter gateway payload uses 'args' not 'parameters'
- CLI validate command — POST→GET mismatch and dead --config code

### 🚜 Refactor

- SOLID/DRY pass — extract shared utilities, remove duplication
- SOLID/DRY pass 2 — eliminate duplication across service
- SOLID/DRY pass 3 — eliminate redundant scan, fix archive path bug
- SOLID/DRY pass 4 — extract scope helpers, resolve meta dir

### 📚 Documentation

- Rewrite all READMEs and guides for service architecture
- Fix 6 inaccuracies found in validation pass

### 🧪 Testing

- Port lib test suite to service (Phase 2b)

### ⚙️ Miscellaneous Tasks

- Rename lib to jeeves-meta-lib, service to jeeves-meta
- Add release scripts to service package
- Release @karmaniverous/jeeves-meta v0.4.0
