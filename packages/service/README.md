# @karmaniverous/jeeves-meta

HTTP service for the Jeeves knowledge synthesis engine. Provides a Fastify API, built-in croner-based scheduler, single-threaded synthesis queue, and a Commander CLI.

## Features

- **Fastify HTTP API** — `/status`, `/metas`, `/metas/:path` (GET + PATCH), `/preview`, `/synthesize`, `/synthesize/abort`, `/seed`, `/unlock`, `/config`, `/config/apply`, `/queue`, `/queue/clear`
- **Phase-state machine** — per-meta `_phaseState` tracking `{ architect, builder, critic }` × `{ fresh, stale, pending, running, failed }`
- **Built-in scheduler** — croner-based cron with adaptive backoff; picks one phase per tick across entire corpus
- **Three-layer synthesis queue** — `current` (running phase) + `overrides` (explicit triggers) + `automatic` (scheduler candidates)
- **Three-phase orchestration** — architect, builder, critic with surgical retry of failed phases
- **Discovery via watcher** — filesystem-based meta discovery (no Qdrant dependency)
- **Ownership tree** — hierarchical scoping with child meta rollup
- **Cross-meta references** — `_crossRefs` declares relationships to other metas; referenced `_content` included as architect/builder context
- **Archive management** — timestamped snapshots with configurable pruning
- **Lock staging** — write to `.lock` → copy to `meta.json` → archive (crash-safe)
- **Staging file retry** — configurable retries (`stagingRetries`, `stagingRetryDelayMs`) when sub-agent output file is not yet visible after session completion (network/NFS latency)
- **Preview delta cap** — `/preview` response includes `deltaFilesTruncated` flag and `deltaCount` total when delta files exceed `previewDeltaFilesCap`
- **Virtual rule registration** — registers 3 watcher inference rules at startup with retry
- **Progress reporting** — real-time synthesis events via gateway channel messages
- **Graceful shutdown** — stop scheduler, release locks, close server
- **Built-in prompts** — default architect and critic prompts ship with the package
- **Handlebars templates** — prompts compiled with `{ config, meta, scope }` context; architect can write template expressions into builder briefs
- **Config hot-reload** — all synthesis parameters reload without restart; restart-required fields (port, URLs) warn on change
- **Auto-seed policy** — config-driven declarative `.meta/` creation via `autoSeed` rules
- **Token tracking** — per-step counts with exponential moving averages
- **CLI** — `status`, `list`, `detail`, `preview`, `synthesize`, `seed`, `unlock`, `config`, `abort`, `prune` (no API route yet, [#69](https://github.com/karmaniverous/jeeves-meta/issues/69)), `queue`, `service` commands, built on the SDK
- **Zod schemas** — validated meta.json and config with open schema support

## Install

```bash
npm install -g @karmaniverous/jeeves-meta
```

## Quick Start

```bash
# Start the service
jeeves-meta start --config /path/to/jeeves-meta/config.json

# Check status
jeeves-meta status

# List all metas
jeeves-meta list

# Run synthesis
jeeves-meta synthesize

# Install as a system service (prints OS-specific instructions)
jeeves-meta service install --config /path/to/jeeves-meta/config.json
```

## HTTP API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/status` | Service health, queue state, dependency checks, phase-state summary. Meta counts come from the last meta list (at most 60 s old, refreshed in the background), so the check never waits on a corpus walk. |
| GET | `/metas` | List metas with summary stats and per-meta projection. Response includes `phaseState` and `owedPhase` per meta. |
| GET | `/metas/:path` | Full detail for a single meta, with optional archive history. Response includes `phaseState`, `owedPhase` and `crossRefs`. |
| GET | `/preview` | Dry-run: preview inputs for next synthesis |
| POST | `/synthesize` | Enqueue synthesis (stalest or specific path) |
| POST | `/synthesize/abort` | Abort the currently running synthesis |
| POST | `/seed` | Create `.meta/` directory + meta.json (optional `crossRefs`, `steer`) |
| POST | `/unlock` | Remove `.lock` file from a meta entity |
| GET | `/config` | Query sanitized config with optional JSONPath (`?path=$.schedule`) |
| POST | `/config/apply` | Apply a config patch (merge or replace) |
| GET | `/queue` | Queue state: `current` (with phase), `pending` overrides, `automatic` candidates |
| POST | `/queue/clear` | Remove all override queue entries |
| PATCH | `/metas/:path` | Update user-settable reserved properties (`_steer`, `_emphasis`, `_depth`, `_crossRefs`, `_disabled`) |
| GET | `/openapi.json` | The OpenAPI 3.1 document of every route above |

Every route is defined in `META_CATALOG` (`@karmaniverous/jeeves-meta-core`) and validated against it: a malformed request is answered 400 `FST_ERR_VALIDATION`. While the service starts, `GET /status` answers 200 with `serviceState: "starting"` (no meta counts until the first meta list loads), `/config`, `/config/apply` and `/openapi.json` are served, and every other route answers 503 `META_NOT_READY`. Use [`@karmaniverous/jeeves-meta-sdk`](../sdk/README.md) for a typed client.

### Errors

Every non-2xx response is Fastify's standard body, `{ statusCode, code?, error, message }`. Branch on `code`:

| `code` | Status | When |
| --- | --- | --- |
| `META_INVALID_JSONPATH` | 400 | `GET /config?path=` with a JSONPath that cannot be evaluated |
| `META_NOT_FOUND` | 404 | No meta at the path given to `GET`/`PATCH /metas/:path` or `GET /preview` |
| `META_ALREADY_EXISTS` | 409 | `POST /seed` where a `.meta/` already exists |
| `META_NOT_LOCKED` | 409 | `POST /unlock` with no lock file |
| `META_CONFIG_UNAVAILABLE` | 500 | `POST /config/apply` on a service started without a config file |
| `META_WATCHER_UNAVAILABLE` | 503 | `GET /metas`, `GET /preview` or `POST /synthesize` could not reach jeeves-watcher; retry later |
| `META_NOT_READY` | 503 | The service is starting; retry shortly |
| `FST_ERR_VALIDATION` | 400 | The request failed the route's schema |
| `JEEVES_CONFIG_INVALID` | 400 | `POST /config/apply`: the merged config is invalid |
| `JEEVES_RESPONSE_VALIDATION` | 500 | The service's own reply failed its schema (a bug; report it) |

An unexpected failure is a 500 with no `code` and a generic message; the cause is in the service log. No response carries `Retry-After`. Upgrading from 0.19: see [Migrating to 0.20](guides/migrating-to-0.20.md).

## Configuration

See the [Configuration Guide](guides/configuration.md) for all fields, defaults, and environment variable substitution.

## Documentation

- **[Guides](guides/index.md)** — concepts, configuration, orchestration, scheduling, architecture
- **[CLI Reference](guides/cli.md)** — all commands with usage

## License

BSD-3-Clause
