# Changelog

All notable changes to this project will be documented in this file.

## [unreleased]

### 🐛 Bug Fixes

- Pin jeeves-meta-core dependency to ^0.1.1
## [0.12.4] - 2026-05-13

### 🚀 Features

- Phase 10 bundle — core package, git-cliff, contracts.tools, cleanup

### 🚜 Refactor

- Hoist shared types and constants to core package for DRY

### ⚙️ Miscellaneous Tasks

- Move changelog generation to after:bump hook
- Bump deps, standardize rollup build, align with jeeves-server
- Release @karmaniverous/jeeves-meta-openclaw v0.12.4
## [0.12.3] - 2026-05-05

### ⚙️ Miscellaneous Tasks

- Add npm publish safety net (.npmignore + gitignore *.local)
- Convert rollup configs from mjs to ts (#103)
- Release @karmaniverous/jeeves-meta-openclaw v0.12.3
## [0.12.2] - 2026-05-03

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.12.2
## [0.12.1] - 2026-04-22

### 💼 Other

- Updated jeeves core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.12.1
## [0.12.0] - 2026-04-17

### 🚀 Features

- Update plugin tools and TOOLS.md for phase-state machine (Tasks #18a-18b)

### 📚 Documentation

- Update SKILL.md for phase-state machine awareness
- Add phase-state machine and troubleshooting guidance to SKILL.md
- Update SKILL.md gotchas for phase-per-tick and backoff behavior
- Update SKILL.md endpoints table and queue description
- Update guides and changelogs for phase-state machine (Tasks #19a-19h)

### 🧪 Testing

- Add phase-state integration tests (Tasks #14-18)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.12.0
## [0.11.0] - 2026-04-16

### 🚀 Features

- Add _disabled flag and meta_update tool (#123, #124)

### 📚 Documentation

- Update READMEs and skill for meta_update tool and _disabled flag

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.11.0
## [0.10.7] - 2026-04-15

### 💼 Other

- Updated jeeves-core

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.7
## [0.10.6] - 2026-04-08

### 🐛 Bug Fixes

- Resolve 5 bugs (#112, #113, #114, #111, #104)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.6
## [0.10.5] - 2026-04-08

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.5
## [0.10.4] - 2026-04-05

### 💼 Other

- Unhoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.4
## [0.10.3] - 2026-04-05

### 💼 Other

- Hoisted jeeves

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.3
## [0.10.2] - 2026-04-05

### 🐛 Bug Fixes

- Consume core importMetaUrl, remove stale rollup configs, handle watcher 503 (fixes #109, #103, #102)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.2
## [0.10.1] - 2026-04-05

### 🧪 Testing

- Tighten assertions per Gemini review feedback

### ⚙️ Miscellaneous Tasks

- Update dependencies (jeeves 0.5.3, eslint, vitest, rollup, etc.)
- Release @karmaniverous/jeeves-meta-openclaw v0.10.1
## [0.10.0] - 2026-04-03

### 🚀 Features

- Bump @karmaniverous/jeeves to ^0.5.1, Node >=22 (M1, M2)
- Wire gatewayUrl for cleanup escalation, use getPackageVersion (M4, H4)

### 🚜 Refactor

- Adopt core fetchJson/postJson in MetaServiceClient (H6)

### 📚 Documentation

- Refresh READMEs for canonical config path and current tool surface
- Fix guide asset paths, update meta-config match and remove host
- Sync all guides, skills, and READMEs with implementation

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.10.0
## [0.9.3] - 2026-04-02

### 🐛 Bug Fixes

- Align StatusResponse with actual /status shape, add run stub to descriptor

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.9.3
## [0.9.2] - 2026-03-31

### ⚙️ Miscellaneous Tasks

- Resolve merge conflicts with main, bump core to ^0.4.6
- Release @karmaniverous/jeeves-meta-openclaw v0.9.2
## [0.9.1] - 2026-03-30

### 🚀 Features

- Integrate core 0.4.5 — add descriptor.run, fix start recursion

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.9.1
## [0.9.0] - 2026-03-30

### 🚀 Features

- Phase 1 — config migration, descriptor, bind address (M1, M2, M6)
- Phase 2 — config apply, status handler, queue management, archive watcher scan (M5, M5b, M7c)
- Phase 3 — service CLI + plugin toolset + plugin CLI (M3, M4, M7, M7b)
- Integrate core 0.4.5 — add descriptor.run, fix start recursion

### 🐛 Bug Fixes

- Handle invalid JSON in crossRefs parameter (PR review feedback)

### 📚 Documentation

- Sync tools, guides, and READMEs with implementation
- Add front matter to guides (title + children pattern from jeeves-server)

### ⚙️ Miscellaneous Tasks

- Update dependencies — core ^0.4.4 (Zod 4), ESLint 10, knip 6, typedoc 0.28.18, typescript-eslint 8.57.2
- Integrate core 0.4.6 — remove init() workaround from descriptor.run
- Release @karmaniverous/jeeves-meta-openclaw v0.9.0
## [0.8.3] - 2026-03-28

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.8.3
## [0.8.2] - 2026-03-25

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.8.2
## [0.8.1] - 2026-03-25

### 📚 Documentation

- Sync all docs with built-in prompts, optional config, Handlebars templates

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.8.1
## [0.8.0] - 2026-03-24

### 📚 Documentation

- Update all documentation to reflect v0.10.0 features (autoSeed, hot-reload, _id auto-gen)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.8.0
## [0.7.0] - 2026-03-23

### 🚀 Features

- Add _crossRefs support (Phase 1, issue #63)

### 🐛 Bug Fixes

- Repair interrupted numbered list in SKILL.md (Gemini review)

### 📚 Documentation

- Update READMEs and consumer skill for _crossRefs
- Update guides for _crossRefs (tools-reference, concepts)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.7.0
## [0.6.0] - 2026-03-22

### 🐛 Bug Fixes

- Upgrade @karmaniverous/jeeves to ^0.3.0 and trim TOOLS.md meta section (#67)

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.6.0
## [0.5.0] - 2026-03-22

### 🚀 Features

- *(openclaw)* Adopt core SDK v0.2.0 - Phase 1
- *(openclaw)* Add meta_seed, meta_unlock, meta_config tools

### 🐛 Bug Fixes

- *(service)* Persist builder error to meta.json on non-timeout failure
- Standardise bind address, plugin configSchema naming, and defaults (#65)

### 🚜 Refactor

- SOLID/DRY pass — extract finalizeCycle, deduplicate PLUGIN_ID and tool registration

### 📚 Documentation

- Update skills, READMEs for v0.7.0 — 7 tools, _state, GET /config
- Sync all guides and READMEs with v0.7.0 implementation

### 🧪 Testing

- *(openclaw)* Add promptInjection tests for 7-tool set

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.5.0
## [0.4.1] - 2026-03-19

### 🐛 Bug Fixes

- *(openclaw)* Bundle @karmaniverous/jeeves instead of externalizing
- *(openclaw)* Update @karmaniverous/jeeves to 0.1.3 (inlined content files)
- *(openclaw)* Use core resolveWorkspacePath from @karmaniverous/jeeves v0.1.4
- *(openclaw)* Update @karmaniverous/jeeves to 0.1.5 (workspace path fallback fix)
- *(openclaw)* Update jeeves to 0.1.6, add servicePackage/pluginPackage fields

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.4.1
## [0.4.0] - 2026-03-18

### 🚀 Features

- *(openclaw)* Adopt @karmaniverous/jeeves v0.1.0 for TOOLS.md management

### 🐛 Bug Fixes

- Add tagPrefix to auto-changelog config for monorepo tags
- Surface watcher indexing state in /status, fix rulesRegistered false-negative (#43)
- *(openclaw)* Derive plugin version from package.json instead of hard-coding

### 💼 Other

- Remove cumulative token usage from TOOLS injection (not actionable for agent)

### 🚜 Refactor

- *(openclaw)* Adopt createAsyncContentCache from @karmaniverous/jeeves v0.1.1
- *(openclaw)* Resolve SOLID/DRY violations
- *(openclaw)* Resolve SOLID/DRY violations
- *(openclaw)* Address Gemini review — add resolvePath to PluginApi

### 📚 Documentation

- Full documentation pass — PlantUML diagrams, sync with implementation

### 🎨 Styling

- Fix prettier formatting in promptInjection test

### 🧪 Testing

- *(openclaw)* Add serviceCommands tests, trim trivial helper tests

### ⚙️ Miscellaneous Tasks

- *(openclaw)* Fix knip warnings — un-export unused PLUGIN_ID, ToolMeta, MetaServiceConfig
- Update dependencies via ncu
- Release @karmaniverous/jeeves-meta-openclaw v0.4.0
## [0.3.0] - 2026-03-15

### 💼 Other

- Phase 5: Plugin rulesRegistered warning + cleanup stale exports
- Close review gaps: health check tests, plugin promptInjection tests, skill updates, stale JSDoc, spec isStale entry
- Update READMEs, guides, comments to reflect walk-based discovery and health check

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.3.0
## [0.2.0] - 2026-03-11

### 🚀 Features

- Make meta_trigger fire-and-forget
- Progress reporter (Phase 7)
- Plugin conversion to thin HTTP client (Phase 10)

### 🐛 Bug Fixes

- Revert @module tag cleanup, add tsdoc.json to service package
- Resolve all spec gaps — wire real data into routes, scheduler, status
- Resolve 11 spec conformance gaps (A-K)
- Plugin items→metas array name mismatch + spec updates
- Path convention consistency, CLI service start, dependency health reporting
- UpsertMetaSection handles duplicate ## Meta sections
- Plugin manifest configSchema and TOOLS.md bootstrapping prompts

### 🚜 Refactor

- Rename synth types/rules/payload to meta
- Rename synth_* tools to meta_*

### 📚 Documentation

- Rewrite all READMEs and guides for service architecture
- Fix 6 inaccuracies found in validation pass
- Comprehensive SKILL.md validation and expansion
- SKILL.md validation pass 2 — 6 inaccuracies fixed
- SKILL.md validation pass 3 — accuracy and completeness

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.2.0
## [0.1.5] - 2026-03-10

### 🚀 Features

- Configurable meta property shape (Phase 7m)

### 🚜 Refactor

- DRY and robustness pass

### 📚 Documentation

- Rewrite SKILL.md admin sections for current architecture
-  docs: add path parameter to synth_preview in SKILL.md

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.1.5
## [0.1.4] - 2026-03-10

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.1.4
## [0.1.3] - 2026-03-10

### 🐛 Bug Fixes

- Consolidate meta listing + dedupe in lib

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.1.3
## [0.1.2] - 2026-03-10

### 🚀 Features

- Virtual rules use configurable domain tags from metaProperty/metaArchiveProperty

### 🚜 Refactor

- Plugin tools and prompt injection use config-based discovery and domain filter
- Add targetPath to orchestrate, remove globMetas/ensureMetaJson/watchPaths

### ⚙️ Miscellaneous Tasks

- Lint fixes and remove deprecated warnings after watcher discovery refactor
- Release @karmaniverous/jeeves-meta-openclaw v0.1.2
## [0.1.1] - 2026-03-09

### 🐛 Bug Fixes

- SKILL.md bootstrap with global install, remove duplicate shebang

### ⚙️ Miscellaneous Tasks

- Release @karmaniverous/jeeves-meta-openclaw v0.1.1
## [0.1.0] - 2026-03-09

### 🚀 Features

- Phase 7 - OpenClaw plugin with synth tools
- Virtual rules + synth_trigger + GatewayExecutor
- *(openclaw)* Add installer CLI + tests; fix plugin metadata
- TOOLS.md disk writer and prompt injection (#5) ([#5](https://github.com/karmaniverous/jeeves-meta/pull/5))
- Bundle jeeves-meta skill with plugin build (#6) ([#6](https://github.com/karmaniverous/jeeves-meta/pull/6))
- Library CLI with config loader and 10 commands (#8) ([#8](https://github.com/karmaniverous/jeeves-meta/pull/8))
- Replace synth-config template with declarative render (#9) ([#9](https://github.com/karmaniverous/jeeves-meta/pull/9))
- Migrate synth_list from filesystem glob to watcher_scan (#10) ([#10](https://github.com/karmaniverous/jeeves-meta/pull/10))

### 🐛 Bug Fixes

- Fix all spec-vs-implementation gaps (round 2)

Code:
- batchSize loop: orchestrate() now runs up to batchSize cycles
- synth_list TODO: marked for watcher_scan migration (P2)

Spec fixes:
- Step 4 garbled text removed
- Prerequisites §10: POST /scan → ✅ Shipped
- Design decision numbering: 35-42 renumbered to 43-50 (collision)
- orchestrate return type: void → OrchestrateResult
- WatcherClient: registerRule → registerRules (plural)
- Package tree: subdirectories → flat files
- §5 staleness: clarified timestamp-based computation
- engine.synthesize(path) → synthesizePath(path)
- _synthesisCount: default(0) → optional (matches impl)
- Round 3 spec/impl alignment
- Round 4 gaps + architect self-reference
- Round 5 — structure hash scoping + SKILL.md + preview pagination
- Type SynthEntity, resolve all lint/tsdoc warnings, clean knip findings
- Use shared computeEffectiveStaleness in synth_list (#2) ([#2](https://github.com/karmaniverous/jeeves-meta/pull/2))
- Add outDir to CLI rollup builds for clean-build compatibility
- Clean up knip configs in both packages

### 💼 Other

- Resolve spec-vs-implementation gaps

- createSynthEngine factory API (Gap 1)
- synth-config.hbs template for virtual rule 3 (Gap 2)
- skill/SKILL.md consumer documentation (Gap 3)
- @file: config resolution via configLoader (Gap 6)
- paginatedScan for exhaustive scope enumeration (Gap 7)
- isStale watcher verification in orchestrate (Gap 9)
- archive history section in architect prompt (Gap 10)
- fix orchestrate tests for new isStale + pagination
- Implement dev plan gaps: token tracking, tool refactor, scope condensation

SynthExecutor.spawn() now returns SynthSpawnResult { output, tokens? }
instead of bare string. Token counts flow through orchestrate() into
meta.json as _architectTokens/_builderTokens/_criticTokens with
exponential moving averages (_*TokensAvg, decay 0.3).

Plugin tools refactored:
- synth_list replaces synth_status + synth_entities (summary + projection)
- synth_detail: single meta with field projection + optional archive history
- Fixed hardcoded depthWeight: 1 bug in staleness calculations

Other changes:
- batchSize config option (default 1)
- condenseScopeFiles: glob-like summaries instead of raw file listings
- EMA helper module
- Enriched virtual rule 1 with token + synthesis count fields
- GatewayExecutor returns SynthSpawnResult
- Added env.local.template

### 🚜 Refactor

- Move GatewayExecutor from plugin to lib package (#1) ([#1](https://github.com/karmaniverous/jeeves-meta/pull/1))
- Simplify plugin config — configPath drives everything (#3) ([#3](https://github.com/karmaniverous/jeeves-meta/pull/3))
- Normalize paths with shared normalizePath utility (#4) ([#4](https://github.com/karmaniverous/jeeves-meta/pull/4))
- SOLID/DRY pass across entire codebase (#11) ([#11](https://github.com/karmaniverous/jeeves-meta/pull/11))

### 📚 Documentation

- Add TypeDoc setup, READMEs, guides, and PlantUML diagrams
- Move changelogs to package level
- Full documentation pass — sync all docs with implementation (#13) ([#13](https://github.com/karmaniverous/jeeves-meta/pull/13))

### ⚙️ Miscellaneous Tasks

- Scaffold monorepo from jeeves-watcher template
- Rename jeeves-synth to jeeves-meta everywhere
- Release @karmaniverous/jeeves-meta-openclaw v0.1.0
