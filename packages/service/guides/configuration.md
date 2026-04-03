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
| `defaultArchitect` | string | (built-in) | Architect system prompt override. Supports `@file:` references. Omit to use built-in default. |
| `defaultCritic` | string | (built-in) | Critic system prompt override. Supports `@file:` references. Omit to use built-in default. |
| `architectEvery` | integer | `10` | Run architect every N cycles per meta |
| `depthWeight` | number | `0.5` | Exponent for depth weighting in staleness formula |
| `maxArchive` | integer | `20` | Maximum archive snapshots per meta |
| `maxLines` | integer | `500` | Max context lines in subprocess prompts |
| `architectTimeout` | integer | `120` | Architect subprocess timeout (seconds) |
| `builderTimeout` | integer | `600` | Builder subprocess timeout (seconds) |
| `criticTimeout` | integer | `300` | Critic subprocess timeout (seconds) |
| `thinking` | string | `"low"` | Thinking level for spawned sessions |
| `skipUnchanged` | boolean | `true` | Skip candidates with no file changes |
| `metaProperty` | object | `{ _meta: "current" }` | Watcher metadata for live meta.json files |
| `metaArchiveProperty` | object | `{ _meta: "archive" }` | Watcher metadata for archive snapshots |

## Service Fields (extends MetaConfig)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | integer | `1938` | HTTP listen port |

| `schedule` | string | `*/30 * * * *` | Cron expression for synthesis scheduling |
| `reportChannel` | string | — | Gateway channel target for progress messages |
| `watcherHealthIntervalMs` | number | `60000` | Periodic watcher health check interval in ms. 0 = disabled. |
| `serverBaseUrl` | string | — | Base URL for entity links in progress reports (e.g. `http://myserver:1938`) |
| `autoSeed` | array | `[]` | Auto-seed policy rules. Each rule: `{ match: string, steer?: string, crossRefs?: string[] }`. Glob patterns matched against `watcher.walk()` results. Rules evaluated in order; last match wins for steer/crossRefs. |
| `logging.level` | string | `"info"` | Log level (trace/debug/info/warn/error) |
| `logging.file` | string | — | Log file path |

## Hot-Reload

All config fields hot-reload without a service restart **except** these restart-required fields:

- `port` — HTTP listen port

- `watcherUrl` — watcher service URL
- `gatewayUrl` — OpenClaw gateway URL
- `gatewayApiKey` — gateway authentication key
- `defaultArchitect` — architect system prompt
- `defaultCritic` — critic system prompt

When a restart-required field changes, the service logs a warning but the change does not take effect until restart. All other fields (including `schedule`, `reportChannel`, `autoSeed`, timeouts, `metaProperty`, `logging.level`, etc.) are applied immediately on config file save.

## Environment Variables

Config values support `${VAR}` substitution from environment variables. Example:

```json
{ "gatewayApiKey": "${OPENCLAW_API_KEY}" }
```

## Prompt System

The service ships with built-in default architect and critic prompts. `defaultArchitect` and `defaultCritic` are optional — set them only to override the built-in defaults.

When set, they support `@file:` references resolved relative to the config file:

```json
{ "defaultArchitect": "@file:prompts/architect.md" }
```

All prompts (built-in, config-overridden, and per-meta `_architect`/`_critic`) are compiled as Handlebars templates at synthesis time. Available variables include `{{config.*}}` (all config fields), `{{scope.*}}` (fileCount, deltaCount, childCount, crossRefCount), and `{{meta.*}}` (per-meta fields). Escape with `\{{` for literal double-braces.

