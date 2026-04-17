# jeeves-meta — OpenClaw Skill

## Overview

jeeves-meta is the Jeeves platform's knowledge synthesis engine. It discovers
`.meta/` directories via the watcher's filesystem walk endpoint (`POST /walk`),
gathers context from co-located source files, and uses a three-step LLM process
(architect, builder, critic) to produce structured synthesis artifacts.

Each meta entity carries a **phase-state machine** (`_phaseState`) tracking
the state of each phase independently: `fresh`, `stale`, `pending`, `running`,
or `failed`. The scheduler picks **one phase per tick** across the entire
corpus (critic > builder > architect priority), enabling surgical retries of
failed phases without re-running the full pipeline.

**Requires:** jeeves-watcher ≥ 0.10.0 (provides `POST /walk` and auto
rules-reindex on registration).

Discovery is filesystem-based (no Qdrant dependency). The service registers
virtual inference rules with the watcher for rendering and metadata tagging;
the watcher's `/status` response includes `rulesRegistered` to surface
registration health.

## Available Tools

### meta_list
List all `.meta/` directories with summary stats and per-meta projection.
Supports filtering by path prefix, error status, staleness, lock state, and
disabled status. Use for engine health checks and finding stale knowledge.
Each meta entry includes `phaseState` (`{ architect, builder, critic }`)
showing the per-phase state.

**Parameters:**
- `pathPrefix` (optional): Filter by path prefix (e.g. "github/")
- `filter` (optional): Structured filter (`{ hasError: true }`, `{ staleHours: 24 }`, `{ disabled: true }`)
- `fields` (optional): Property projection array

### meta_detail
Full detail for a single meta, with optional archive history. Includes
`_phaseState` showing the per-phase state machine status.

**Parameters:**
- `path` (required): `.meta/` or owner directory path
- `fields` (optional): Property projection
- `includeArchive` (optional): false, true, or number (N most recent)

### meta_preview
Dry-run for the next synthesis candidate. Shows scope files, delta files,
architect trigger reasons, steer status, structure changes, and the
phase that would execute next — without running any LLM calls. Includes
`phaseState` and `owedPhase` (the phase that would run). Use before
`meta_trigger` to understand what will happen.

**Parameters:**
- `path` (optional): Specific `.meta/` or owner directory path. If omitted,
  previews the stalest candidate.

### meta_trigger
Enqueue a synthesis for a specific meta or the next-stalest candidate.
The synthesis runs asynchronously in the service queue; the tool returns
immediately with the queue position. Only one phase runs per tick (the
owed phase). Includes `owedPhase` in the response showing which phase
will execute.

**Parameters:**
- `path` (optional): Specific `.meta/` or owner directory path. If omitted,
  synthesizes the stalest candidate.

### meta_seed
Create a new `.meta/` directory with a skeleton `meta.json` (containing a
UUID `_id`). Use this to bootstrap synthesis for a new path before the
first cycle runs. Supports optional cross-references for metas that
aggregate context from other metas.

**Parameters:**
- `path` (required): Owner directory path where `.meta/` will be created.
- `crossRefs` (optional): JSON array of cross-ref owner paths
  (e.g. `'["j:/path/a","j:/path/b"]'`). Written as `_crossRefs` in the
  initial `meta.json`.
- `steer` (optional): Steering prompt string. Written as `_steer` in the
  initial `meta.json`.

### meta_unlock
Remove a stale `.lock` file from a meta entity. Locks are created during
synthesis and normally cleaned up automatically; use this when a synthesis
crashed and left a lock behind.

**Parameters:**
- `path` (required): `.meta/` or owner directory path with a stuck lock.

### meta_config
Query the running service configuration. Supports optional JSONPath
filtering to extract specific settings. Sensitive fields (e.g.
`gatewayApiKey`) are redacted.

**Parameters:**
- `path` (optional): JSONPath expression (e.g. `$.schedule`). If omitted,
  returns the full sanitized config.

### meta_update
Update user-settable reserved properties on a meta entity. Use this to
toggle `_disabled`, change `_steer`, adjust `_emphasis` or `_depth`, or
modify `_crossRefs` — without editing `meta.json` directly on the filesystem.

**Parameters:**
- `path` (required): `.meta/` or owner directory path.
- `updates` (required): Object with properties to set. Supported:
  `_steer`, `_emphasis`, `_depth`, `_crossRefs`, `_disabled`.
  Set a value to `null` to remove the property.

### meta_queue
Queue management: list pending items, clear the queue, or abort current
synthesis. The queue has three layers: `current` (the running phase),
`overrides` (explicitly triggered entries), and `automatic` (scheduler-
computed candidates). The `pending` and `state` fields provide legacy
compatibility.

**Parameters:**
- `action` (required): One of `list`, `clear`, `abort`.
  - `list`: Show current queue state (current with phase, overrides,
    automatic candidates, pending items).
  - `clear`: Remove all override queue entries.
  - `abort`: Stop the currently running phase and release its lock.

## When to Use

- **Checking synthesis health:** `meta_list`
- **Finding stale knowledge:** `meta_list` with `filter: { staleHours: 24 }`
- **Checking errors:** `meta_list` with `filter: { hasError: true }`
- **Getting full details:** `meta_detail` with optional `includeArchive: 5`
- **Understanding what a cycle will do:** `meta_preview`
- **Forcing a refresh:** `meta_trigger` with optional path
- **Seeding a new meta:** `meta_seed` with path (and optional `crossRefs`)
- **Seeding a cross-ref meta:** `meta_seed` with path and `crossRefs` JSON array
- **Checking cross-ref health:** `meta_detail` with path — `crossRefs` array shows resolved/missing status
- **Clearing a stuck lock:** `meta_unlock` with path
- **Inspecting service config:** `meta_config` with optional JSONPath
- **Checking queue state:** `meta_queue` with action `list`
- **Clearing queued work:** `meta_queue` with action `clear`
- **Aborting stuck synthesis:** `meta_queue` with action `abort`
- **Disabling a meta:** `meta_update` with path and `updates: { _disabled: true }`
- **Re-enabling a meta:** `meta_update` with path and `updates: { _disabled: null }`
- **Changing steer via API:** `meta_update` with path and `updates: { _steer: "new focus" }`
- **Reading synthesis output:** Use `watcher_search` filtered by the properties
  configured in `metaProperty` (e.g. `{ "domains": ["meta"] }` in production).
  The default properties are `{ _meta: "current" }` for live metas and
  `{ _meta: "archive" }` for archive snapshots.

## Key Concepts

- **Steering (`_steer`):** Human-written prompt in `meta.json` that guides
  synthesis focus. The only field humans typically write.
- **Cross-references (`_crossRefs`):** Optional array of owner paths pointing
  to other metas. Referenced metas' `_content` is included as context for
  the architect and builder steps (not the critic). Enables organizational
  views that aggregate across source domains without requiring data
  co-location. Cycles are permitted (A refs B, B refs A). No transitive
  closure — if A needs C's content, declare the ref explicitly.
- **Staleness:** Time since last synthesis. Deeper metas (leaves) update more
  often than rollup metas (parents). Cross-ref freshness does NOT affect
  the referencing meta's staleness — each meta synthesizes independently.
- **Disabled (`_disabled`):** Set `_disabled: true` on a meta to exclude it
  from automatic staleness scheduling. The scheduler and auto-select both
  skip disabled metas. Manual triggers (`meta_trigger` with explicit path)
  still work. Use `meta_update` to toggle the flag.
- **Three steps:** Architect crafts the task brief, Builder produces content,
  Critic evaluates quality. The feedback loop self-improves over cycles.
- **Archives:** Each cycle creates a timestamped snapshot in `.meta/archive/`.
- **Progressive synthesis (`_state`):** The builder can set an opaque `_state`
  value in its output JSON. This state is persisted in `meta.json` and passed
  back as context on the next cycle, enabling multi-cycle progressive work
  (e.g. phased analysis, incremental refinement). On builder timeout, the
  engine attempts to recover partial output — if `_state` advanced, it saves
  the new state without overwriting existing content.
- **Phase-state machine (`_phaseState`):** Each meta tracks its three phases
  independently: `{ architect: <state>, builder: <state>, critic: <state> }`.
  States are `fresh`, `stale`, `pending`, `running`, or `failed`. The
  scheduler picks the single highest-priority owed phase across all metas
  each tick (critic > builder > architect, with staleness tiebreaking).
  Failed phases are automatically retried on the next tick (promoted from
  `failed` → `pending`). Only the failed phase reruns — upstream/downstream
  phases are untouched (surgical retries). A full cycle completes only when
  all three phases are `fresh`, at which point the archive snapshot is taken
  and `_synthesisCount` increments. Legacy metas without `_phaseState` have
  their state derived automatically from existing fields on first load.

## Configuration

### Config File

Location determined by `JEEVES_META_CONFIG` env var or `--config` CLI flag.
Canonical deployment: `J:\config\jeeves-meta\config.json`.

Key settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `watcherUrl` | (required) | Watcher service URL (e.g. `http://localhost:1936`) |
| `gatewayUrl` | `http://127.0.0.1:18789` | OpenClaw gateway URL for subprocess spawning |
| `gatewayApiKey` | (optional) | API key for gateway authentication |
| `metaProperty` | `{ _meta: "current" }` | Watcher metadata properties applied to live `.meta/meta.json` files. `Record<string, unknown>` — any shape accepted. |
| `metaArchiveProperty` | `{ _meta: "archive" }` | Watcher metadata properties applied to `.meta/archive/**` snapshots. Same shape flexibility. |
| `architectEvery` | 10 | Re-run architect every N cycles even if structure unchanged |
| `depthWeight` | 0.5 | Exponent for depth-based scheduling (0 = pure staleness) |
| `maxArchive` | 20 | Max archived snapshots per meta |
| `maxLines` | 500 | Max lines for builder context |
| `architectTimeout` | 180s | Architect subprocess timeout |
| `builderTimeout` | 360s | Builder subprocess timeout |
| `criticTimeout` | 240s | Critic subprocess timeout |
| `skipUnchanged` | true | Skip candidates with no changes since last synthesis |
| `thinking` | `low` | Thinking level for spawned LLM sessions |
| `port` | 1938 | HTTP API listen port |

| `schedule` | `*/30 * * * *` | Cron expression for automatic synthesis scheduling |
| `serverBaseUrl` | (optional) | Public base URL of the service (e.g. `http://myhost:1938`). When set, progress reports include clickable entity links. |
| `reportChannel` | (optional) | Gateway channel target for progress messages (e.g. Slack channel ID) |
| `logging.level` | `info` | Log level (trace/debug/info/warn/error) |
| `logging.file` | (optional) | Log file path |

### Meta Discovery

Discovery is entirely filesystem-based (no Qdrant dependency). The engine:

1. **Registers virtual inference rules** at service startup. These rules match
   file paths (`**/.meta/meta.json` and `**/.meta/archive/*.json`) and apply
   the configured `metaProperty`/`metaArchiveProperty` values as watcher
   metadata on those indexed points.

2. **Discovers metas** via `watcher.walk(["**/.meta/meta.json"])` — a filesystem
   walk provided by the watcher's `POST /walk` endpoint. This enumerates all
   `.meta/meta.json` files under watched paths without using Qdrant or any
   vector database queries.

3. **Deduplicates** results by `.meta/` directory path and builds the
   ownership tree.

**Important:** If you change `metaProperty` or `metaArchiveProperty` in config,
you must:
- Restart the jeeves-meta service (so it re-registers virtual rules with the
  new property values)
- Trigger a watcher rules reindex (`watcher_reindex` with scope `rules`) so
  existing indexed points get retagged with the new properties

### Configuring Meta Properties

`metaProperty` and `metaArchiveProperty` are `Record<string, unknown>` — any
JSON-serializable key-value structure. The virtual rules spread these properties
onto every matching indexed point. The discovery filter is derived from the same
properties.

**Example configurations:**

```json
// Default (no config needed):
// Live metas get { _meta: "current" }, archives get { _meta: "archive" }

// Using watcher domains:
{
  "metaProperty": { "domains": ["meta"] },
  "metaArchiveProperty": { "domains": ["meta-archive"] }
}

// Custom tagging:
{
  "metaProperty": { "project": "myproject", "kind": "synthesis" }
}
```

### Prompt System

The service ships with built-in default architect and critic prompts. Most
installations need no prompt configuration at all.

**Overriding defaults:** Set `defaultArchitect` and/or `defaultCritic` in the
config to replace the built-in prompts. Supports `@file:` references resolved
relative to the config file's directory:

```json
{
  "defaultArchitect": "@file:jeeves-meta/prompts/architect.md",
  "defaultCritic": "@file:jeeves-meta/prompts/critic.md"
}
```

**Per-meta overrides:** Set `_architect` or `_critic` directly in a `meta.json`
to override the defaults for that specific entity.

**Template variables:** All prompts (default, config-overridden, and per-meta)
are compiled as Handlebars templates at synthesis time with access to:

- `{{config.builderTimeout}}`, `{{config.maxLines}}`, `{{config.architectEvery}}`, etc.
- `{{scope.fileCount}}`, `{{scope.deltaCount}}`, `{{scope.childCount}}`, `{{scope.crossRefCount}}`
- `{{meta._depth}}`, `{{meta._emphasis}}`

The architect prompt can write template expressions into its `_builder` output
using escaped syntax (`\{{config.builderTimeout}}`). These pass through the
architect compilation as literal `{{...}}` text and resolve when the builder
prompt is compiled.

### Minimal Config Example

A minimum viable config file requires only `watcherUrl`:

```json
{
  "watcherUrl": "http://localhost:1936",
  "gatewayUrl": "http://127.0.0.1:18789",
  "gatewayApiKey": "your-api-key"
}
```

All other fields use sensible defaults (port 1938, schedule every 30 min,
depth weight 0.5, built-in prompts, etc). Add `reportChannel`, `metaProperty`,
`logging`, etc. as needed.

### Adding New Metas

1. Create the `.meta/` directory under the domain path
2. Seed it: `jeeves-meta seed <path>` — creates `meta.json`
   with a UUID (`_id`). All other fields are populated on first synthesis
3. Optionally edit `meta.json` to set `_steer`, `_depth`, `_emphasis`,
   and `_crossRefs`
4. Wait for the watcher to index the new `meta.json` (typically seconds via
   chokidar file watching)
5. The entity appears in `meta_list` on the next query

**Note:** `_id` is optional in `meta.json`. A minimal stub of just `{}` or
`{ "_steer": "..." }` is valid — a UUID will be auto-generated on first
synthesis. The `meta_seed` tool and auto-seed always generate `_id` at
creation time.

### Auto-Seed Policy

The `autoSeed` config field enables declarative, config-driven `.meta/`
creation. It is an array of policy rules, each with the shape:

```json
{ "match": "<glob>", "steer": "<optional prompt>", "crossRefs": ["<optional paths>"] }
```

- **`match`** (required) — a glob pattern compatible with `watcher.walk()`.
  The watcher walks all watched paths matching this glob and returns file
  paths. Parent directories of matched files become seed candidates.
- **`steer`** (optional) — steering prompt written as `_steer` in the
  seeded `meta.json`.
- **`crossRefs`** (optional) — array of cross-ref owner paths written as
  `_crossRefs` in the seeded `meta.json`.

**Evaluation order:** Rules are processed in array order. If multiple rules
match the same directory, the last match wins for `steer` and `crossRefs`.

**Behavior:**
- Auto-seed runs at the start of each scheduler tick, before candidate
  discovery. Directories that already have a `.meta/` subdirectory are
  skipped.
- Empty directories (no files matching any glob) will not be seeded — the
  watcher walk only returns actual file paths, and parent directories are
  derived from those.
- The `autoSeed` field hot-reloads with all other non-restart-required
  config fields.

**Example:**

```json
{
  "autoSeed": [
    { "match": "domains/meetings/*/**", "steer": "Summarize this meeting." },
    { "match": "domains/github/**/*.md", "steer": "Summarize this repository." }
  ]
}
```

### Adding Cross-Reference Metas

For metas that aggregate context from other metas (e.g. an organizational
rollup that pulls from GitHub, Slack, and email metas):

1. Seed with cross-refs: use `meta_seed` with both `path` and `crossRefs`
   parameters. Example: seed `j:/veterancrowd/projects/ops` with refs to
   `["j:/veterancrowd/github","j:/veterancrowd/slack"]`
2. Set `_steer` to guide synthesis focus across the referenced sources
3. Verify refs: `meta_detail <path>` shows `crossRefs` status (resolved/missing)
4. Cross-ref metas can have zero sibling files — all context comes from refs
   and child metas. The engine handles empty scopes gracefully.

**Pure meta trees:** Directories containing only `.meta/` subdirectories and
no source data are valid. Use `_crossRefs` and `_steer` to define what context
flows in. Useful for organizational views (people, projects) that aggregate
across physically distributed data.

### Tuning Scheduling

- **`_depth`:** Higher = updates more often. Defaults from tree nesting depth.
- **`_emphasis`:** Per-meta multiplier (default 1). Set 2 to double priority,
  0.5 to halve it.
- **`depthWeight`:** Global exponent. Set 0 for pure staleness rotation.
- **`architectEvery`:** Higher = fewer architect runs (cheaper but slower to
  adapt to structural changes).

### Config Hot-Reload

All config fields hot-reload without restarting the service **except** these
restart-required fields:

- `port` — HTTP listen port
- `watcherUrl` — watcher service URL
- `gatewayUrl` — OpenClaw gateway URL
- `gatewayApiKey` — gateway authentication key
- `defaultArchitect` — architect system prompt
- `defaultCritic` — critic system prompt

Edit the config file and save; the service detects changes via `fs.watchFile`.
When a restart-required field changes, the service logs a warning but the
change does not take effect until restart. All other fields (including
`schedule`, `reportChannel`, `metaProperty`, timeouts, `autoSeed`,
`logging.level`, etc.) are applied immediately.

### Progress Reporting

When `reportChannel` is set, the service sends real-time progress messages
to that channel via the OpenClaw gateway. Events include: synthesis started,
phase started/completed (architect, builder, critic), synthesis completed,
and errors. This uses
`/tools/invoke` → `message` tool — zero LLM token cost.

### TOOLS.md Bootstrapping Prompts

The plugin's TOOLS.md injection automatically prompts bootstrapping:
- **Service unreachable:** Shows "ACTION REQUIRED: jeeves-meta service is
  unreachable" with troubleshooting steps and directs to this skill's
  Bootstrapping section
- **No entities found:** Shows "ACTION REQUIRED: No synthesis entities found"
  and directs to this skill's Bootstrapping section

These messages appear in the agent's system prompt, ensuring proactive
discovery of configuration issues.

## Bootstrapping

### Prerequisites

Before the synthesis engine can operate:

1. **OpenClaw gateway** must be running (the service spawns LLM sessions
   through it via `gatewayUrl`)
   - Verify: `openclaw gateway status` or check the URL in config

2. **jeeves-watcher** must be running and indexing data
   - Verify: `watcher_status` tool or `curl http://localhost:1936/status`
   - The watcher provides both semantic search and structured scan

3. **Qdrant** must be running
   - Verify: `curl http://localhost:6333/healthz`

4. **Config file** must exist at the path specified by `JEEVES_META_CONFIG`
   - Must contain valid `watcherUrl`
   - `defaultArchitect` and `defaultCritic` are optional (built-in defaults
     ship with the package). Set them only to override the defaults.

5. **Prompt files** must exist only if using `@file:` references in config
   - Not needed if using the built-in defaults (most installations)

6. **`.meta/` directories** must exist and be within paths the watcher indexes
   - Seed new metas: `jeeves-meta seed <path>`

### Installation

1. Install and start the jeeves-meta service:

```bash
npm install -g @karmaniverous/jeeves-meta
jeeves-meta start --config J:\config\jeeves-meta\config.json
```

2. Install the OpenClaw plugin:

```bash
npx @karmaniverous/jeeves-meta-openclaw install
```

For non-default OpenClaw installations, set `OPENCLAW_CONFIG` (path to
`openclaw.json`) or `OPENCLAW_HOME` (path to `.openclaw` directory).

To uninstall: `npx @karmaniverous/jeeves-meta-openclaw uninstall`

3. (Optional) Configure the plugin with the service URL — only needed if the
   service runs on a non-default port or host:

```json
{
  "plugins": {
    "entries": {
      "jeeves-meta-openclaw": {
        "enabled": true,
        "config": {
          "apiUrl": "http://127.0.0.1:1938"
        }
      }
    }
  }
}
```

4. Restart the OpenClaw gateway to load the plugin.

5. Verify: check that `## Meta` appears in TOOLS.md injection and
   `jeeves-meta` appears in available skills.

### First Synthesis

1. Check discovery: `meta_list` — should show your `.meta/` entities
2. Preview: `meta_preview` — verify scope files and delta detection
3. Trigger: `meta_trigger` — run the first cycle
4. Review: `meta_detail <path>` with `includeArchive: 1` — check output quality
5. Iterate on `_steer` prompts if needed

### System Service Management

For production deployments, install as a system service:

```bash
jeeves-meta service install --config J:\config\jeeves-meta\config.json
```

This prints OS-specific instructions:
- **Windows:** NSSM service commands
- **macOS:** launchd plist
- **Linux:** systemd unit

Management commands (print OS-specific equivalents):
```bash
jeeves-meta service start     # print start instructions
jeeves-meta service stop      # print stop instructions
jeeves-meta service status    # query running service via HTTP API
jeeves-meta service remove    # print removal instructions
```

### HTTP API

The service exposes these endpoints (default port 1938):

| Method | Path | Description |
|--------|------|-------------|
| GET | `/status` | Service health, queue state, dependency checks |
| GET | `/metas` | List metas with filtering and field projection |
| GET | `/metas/:path` | Single meta detail with optional archive |
| PATCH | `/metas/:path` | Update user-settable reserved properties |
| GET | `/preview` | Dry-run next synthesis candidate |
| POST | `/synthesize` | Enqueue synthesis (stalest or specific path) |
| POST | `/synthesize/abort` | Abort the currently running synthesis |
| POST | `/seed` | Create `.meta/` directory + meta.json |
| POST | `/unlock` | Remove `.lock` file from a meta entity |
| GET | `/config` | Query sanitized config with optional JSONPath (`?path=$.schedule`) |
| POST | `/config/apply` | Apply a config patch (merge or replace) |
| GET | `/queue` | Current queue state (current, pending, stats) |
| POST | `/queue/clear` | Remove all pending queue items |

All endpoints return JSON. The OpenClaw plugin tools are thin wrappers
around these endpoints.

## Service CLI

The service package ships a CLI:

```bash
jeeves-meta <command> [options]
```

Commands: `start`, `status`, `list`, `detail`, `preview`, `synthesize`,
`seed`, `unlock`, `config`, `service install|start|stop|status|remove`.

Config resolution: `--config` flag → `JEEVES_META_CONFIG` env var → error.
All client commands support `-p, --port` to specify the service port (default: 1938).
The `start` command uses `--config`/`-c` instead (port is read from the config file).

## Operational Monitoring

Recommended periodic checks:
- **Errors:** `meta_list` with `filter: { hasError: true }` — investigate
  and retry with `meta_trigger`
- **Failed phases:** The TOOLS.md injection shows a "Failed:" alert listing
  metas with failed phases. Failed phases auto-retry on the next scheduler
  tick. Use `meta_detail` to inspect the `_phaseState` and `_error` fields.
- **Stuck locks:** `meta_list` with `filter: { locked: true }` — locks
  older than 30 minutes indicate a crashed synthesis; use `jeeves-meta unlock`
- **Stale knowledge:** `meta_list` with `filter: { staleHours: 48 }` — check
  if the scheduler is running and the watcher is up
- **Phase health:** `/status` includes `phaseStateSummary` with aggregate
  counts per phase (`fresh`, `stale`, `pending`, `running`, `failed`) and
  `nextPhase` showing the next candidate.
- **Service health:** `/status` endpoint (via `meta_list` summary or direct
  HTTP) includes dependency status for watcher and gateway

The TOOLS.md injection surfaces the most critical stats (entity count, errors,
stalest entity, phase summary, failed-phase alerts, next-phase indicator) in
the agent's system prompt automatically.

## Troubleshooting

### Service unreachable

**Symptom:** TOOLS.md shows "ACTION REQUIRED: jeeves-meta service is unreachable"
**Cause:** Meta service not running or wrong `apiUrl` in plugin config
**Fix:**
1. Check if the service is running: `jeeves-meta service status` or `curl http://localhost:1938/status`
2. If down, start it: `jeeves-meta service start` or `jeeves-meta start --config <path>`
3. If running on a different port, update `apiUrl` in plugin config

### Watcher unreachable

**Symptom:** TOOLS.md shows a ⚠️ **Watcher** dependency warning in the entity summary
**Cause:** Watcher service not running or wrong URL in meta service config
**Fix:**
1. Check watcher status: `watcher_status` tool or `curl http://localhost:1936/status`
2. If down, start the watcher service
3. If running on a different port, update `watcherUrl` in meta service config and restart the service

### No entities discovered

**Symptom:** `meta_list` returns empty, TOOLS.md shows "No synthesis entities found"
**Cause:** No `.meta/meta.json` files indexed, or `metaProperty` mismatch
**Fix:**
1. Verify `.meta/meta.json` files exist on disk
2. Check that the watcher indexes those paths (paths must be in watcher's
   configured `watch` globs)
3. Check that `metaProperty` in config matches the properties actually set
   on indexed points. If you changed `metaProperty`, run `watcher_reindex`
   with scope `rules` and restart the meta service.
4. Seed new metas if needed: `jeeves-meta seed <path>`

### Synthesis stuck (locked entities)

**Symptom:** `meta_list` shows locked entities that never unlock
**Cause:** Previous synthesis crashed, leaving stale `.lock` file
**Fix:**
1. Check lock: `meta_detail <path>` — look for `locked: true`
2. Locks auto-expire after 30 minutes
3. For immediate unlock: `jeeves-meta unlock <path>`
   or delete `.meta/.lock` file manually

### Executor timeouts

**Symptom:** `meta_detail` shows `_error` with code `TIMEOUT`
**Cause:** Subprocess took longer than configured timeout
**Note:** The engine attempts partial recovery on builder timeouts. If the
builder wrote partial output with an advanced `_state`, the state is saved
(preserving existing content) and the error is recorded. This means
progressive work is not lost on timeout — only the content update is skipped.
**Fix:**
1. Check if `_state` advanced (partial recovery succeeded) — subsequent
   cycles can continue from where the builder left off
2. Increase timeout in config (`architectTimeout`, `builderTimeout`,
   `criticTimeout`)
3. Check if the LLM provider is slow or rate-limited
4. Check scope size: large scopes with many files take longer

### LLM errors in synthesis phases

**Symptom:** `meta_detail` shows `_error` field with step/code/message, and
`_phaseState` shows `failed` for one or more phases.
**Cause:** Subprocess failed (API error, malformed output, rate limit)
**Fix:**
1. Check error details: `meta_detail <path>` — `_error.step` tells you
   which phase failed; `_phaseState` shows the exact state of each phase
2. Failed phases are **automatically retried** on the next scheduler tick
   (promoted from `failed` → `pending`). Only the failed phase reruns —
   other phases are untouched (surgical retry).
3. Architect failure with existing `_builder`: engine reuses cached brief
   (self-healing)
4. Architect failure without `_builder` (first run): retry with `meta_trigger`
5. Builder failure: meta stays stale, retried next tick automatically
6. Critic failure: content saved without feedback, not critical

### Discovery returns wrong/stale results

**Symptom:** `meta_list` shows old metas or misses new ones
**Cause:** Virtual rules not re-registered after config change, or watcher
not yet indexed new files
**Fix:**
1. If `metaProperty` changed: restart meta service + `watcher_reindex` (scope: rules)
2. If new `.meta/` directory: wait for chokidar detection (seconds) or
   trigger `watcher_reindex` (scope: full)
3. Verify with `watcher_scan`: query for the expected properties to confirm
   the watcher has the right metadata on the points

## Gotchas

- `meta_trigger` runs a full LLM cycle (3 subprocess calls). It can take
  several minutes.
- A locked meta (another synthesis in progress) will be skipped silently.
- First-run quality is lower — the feedback loop needs 2-3 cycles to calibrate.
- Changing `metaProperty` requires both a meta service restart AND a watcher reindex.
  The service restart re-registers virtual rules; the reindex retags existing points.
- `defaultArchitect`/`defaultCritic` are optional — built-in defaults ship with
  the package. The `@file:` prefix (when used) is resolved relative to the config
  file's directory, not the working directory.
- All prompts are compiled as Handlebars templates. Avoid using `{{` in prompt
  overrides unless you intend template variable resolution. Escape with `\{{`
  for literal double-braces.
- The synthesis queue is single-threaded: one synthesis at a time. HTTP-triggered
  syntheses get priority over scheduler-triggered ones.
- The scheduler uses adaptive backoff: if no stale candidates are found, it
  doubles the skip interval (max 4×). Backoff resets after a successful synthesis.
- All CLI commands except `start` require the service to be running (they call
  the HTTP API).
