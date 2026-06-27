---
title: Configuration
---

# Configuration

The service reads a JSON config file specified via `--config` flag or `JEEVES_META_CONFIG` environment variable.

## Core Fields (MetaConfig)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `watcherUrl` | string (URL) | — | Watcher service base URL (required) |
| `gatewayUrl` | string (URL) | `http://127.0.0.1:18789` | OpenClaw gateway URL |
| `gatewayApiKey` | string | — | Gateway authentication key |
| `architectEvery` | integer | `10` | Run architect every N cycles per meta (min 1) |
| `depthWeight` | number | `0.5` | Exponent for depth weighting in staleness formula (min 0) |
| `maxArchive` | integer | `20` | Maximum archive snapshots per meta (min 1) |
| `maxLines` | integer | `500` | Max context lines in subprocess prompts (min 50) |
| `thinking` | string | `"low"` | Thinking level for spawned sessions |
| `skipUnchanged` | boolean | `true` | Skip candidates with no file changes |
| `metaProperty` | object | — (required) | Watcher metadata for live meta.json files. Avoid underscore-prefixed keys (e.g. `_meta`) — they may conflict with watcher reserved fields and break rendering. |
| `metaArchiveProperty` | object | — (required) | Watcher metadata for archive snapshots. Same underscore-prefix caveat as `metaProperty`. |

## Service Fields (extends MetaConfig)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | integer | `1938` | HTTP listen port (min 1, max 65535) |
| `schedule` | string | `*/30 * * * *` | Cron expression for synthesis scheduling |
| `reportChannel` | string | — | Gateway channel name (e.g. `slack`). Legacy: also used as target if `reportTarget` is unset. |
| `reportTarget` | string | — | Channel/user ID to send progress messages to |
| `serverUrl` | string (URL) | `http://127.0.0.1:1934` | jeeves-server base URL for progress report links |
| `templates.phaseStart` | string | `:gear: ...` | Template for phase start progress reports |
| `templates.phaseEnd` | string | `:white_check_mark: ...` | Template for phase success progress reports |
| `templates.phaseError` | string | `:x: ...` | Template for phase failure progress reports |
| `watcherHealthIntervalMs` | integer | `60000` | Periodic watcher health check interval in ms (min 0). 0 = disabled. |
| `tier2ScanLimit` | integer | `50` | Max all-fresh candidates to scan per tick in Tier 2 invalidation (min 1) |
| `autoSeed` | array | `[]` | Auto-seed policy rules (see below). Rules evaluated in order; last match wins for steer/crossRefs. |
| `workspaceDir` | string | OS tmpdir + `/jeeves-meta` | Directory for synthesis staging files written by sub-agent sessions |
| `stagingRetries` | integer | `10` | Max retries when staging file is not yet visible after session completion (min 0) |
| `stagingRetryDelayMs` | integer | `250` | Delay between staging file retry attempts in ms (min 0) |
| `previewDeltaFilesCap` | integer | `50` | Maximum number of delta files included in `/preview` response (min 1) |
| `logging.level` | string | `"info"` | Log level (trace/debug/info/warn/error) |
| `logging.file` | string | — | Log file path |

### Auto-Seed Rules

Each rule in the `autoSeed` array has the shape:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `match` | string | — | Glob pattern matched against `watcher.walk()` results (required) |
| `steer` | string | — | Steering prompt written as `_steer` in seeded `meta.json` |
| `crossRefs` | string[] | — | Cross-ref owner paths written as `_crossRefs` |
| `parentDepth` | integer | `0` | Walk up this many extra parent levels from the matched file's directory |


## Hot-Reload

All config fields hot-reload without a service restart **except** these restart-required fields:

- `port` — HTTP listen port
- `watcherUrl` — watcher service URL
- `gatewayUrl` — OpenClaw gateway URL
- `gatewayApiKey` — gateway authentication key

When a restart-required field changes, the service logs a warning but the change does not take effect until restart. All other fields (including `schedule`, `reportChannel`, `autoSeed`, timeouts, `metaProperty`, `logging.level`, etc.) are applied immediately on config file save.

## Environment Variables

Config values support `${VAR}` substitution from environment variables. Example:

```json
{ "gatewayApiKey": "${OPENCLAW_API_KEY}" }
```

## Prompt System

The service ships with built-in default architect and critic prompts. Prompts ship with the package and cannot be overridden via config.

All prompts (built-in and per-meta `_architect`/`_critic`) are compiled as Handlebars templates at synthesis time. Available variables include `{{config.*}}` (all config fields), `{{scope.*}}` (fileCount, deltaCount, childCount, crossRefCount), and `{{meta.*}}` (per-meta fields). Escape with `\{{` for literal double-braces.

The architect prompt can write template expressions into its builder brief using escaped syntax (`\{{config.maxLines}}`). These pass through the architect compilation as literal `{{...}}` text and resolve when the builder prompt is compiled.
