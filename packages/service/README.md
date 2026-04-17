# @karmaniverous/jeeves-meta

HTTP service for the Jeeves knowledge synthesis engine. Provides a Fastify API, built-in croner-based scheduler, single-threaded synthesis queue, and a Commander CLI.

## Features

- **Fastify HTTP API** — `/status`, `/metas`, `/preview`, `/synthesize`, `/synthesize/abort`, `/seed`, `/unlock`, `/config`, `/config/apply`, `/queue`, `/queue/clear`
- **Phase-state machine** — per-meta `_phaseState` tracking `{ architect, builder, critic }` × `{ fresh, stale, pending, running, failed }`
- **Built-in scheduler** — croner-based cron with adaptive backoff; picks one phase per tick across entire corpus
- **Three-layer synthesis queue** — `current` (running phase) + `overrides` (explicit triggers) + `automatic` (scheduler candidates)
- **Three-phase orchestration** — architect, builder, critic with surgical retry of failed phases
- **Discovery via watcher** — filesystem-based meta discovery via `/walk` endpoint (no Qdrant dependency)
- **Ownership tree** — hierarchical scoping with child meta rollup
- **Cross-meta references** — `_crossRefs` declares relationships to other metas; referenced `_content` included as architect/builder context
- **Archive management** — timestamped snapshots with configurable pruning
- **Lock staging** — write to `.lock` → copy to `meta.json` → archive (crash-safe)
- **Virtual rule registration** — registers 3 watcher inference rules at startup with retry
- **Progress reporting** — real-time synthesis events via gateway channel messages
- **Graceful shutdown** — stop scheduler, release locks, close server
- **Built-in prompts** — default architect and critic prompts ship with the package; optional config overrides via `@file:` or inline strings
- **Handlebars templates** — prompts compiled with `{ config, meta, scope }` context; architect can write template expressions into builder briefs
- **Config hot-reload** — all synthesis parameters reload without restart; restart-required fields (port, URLs) warn on change
- **Auto-seed policy** — config-driven declarative `.meta/` creation via `autoSeed` rules
- **Token tracking** — per-step counts with exponential moving averages
- **CLI** — `status`, `list`, `detail`, `preview`, `synthesize`, `seed`, `unlock`, `config`, `abort`, `prune`, `queue`, `service` commands
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
|--------|------|-------------|
| GET | `/status` | Service health, queue state, dependency checks, phase-state summary |
| GET | `/metas` | List metas with filtering and field projection |
| GET | `/metas/:path` | Single meta detail with optional archive |
| GET | `/preview` | Dry-run: preview inputs for next synthesis |
| POST | `/synthesize` | Enqueue synthesis (stalest or specific path) |
| POST | `/synthesize/abort` | Abort the currently running synthesis |
| POST | `/seed` | Create `.meta/` directory + meta.json (optional `crossRefs`, `steer`) |
| POST | `/unlock` | Remove `.lock` file from a meta entity |
| GET | `/config` | Query sanitized config with optional JSONPath (`?path=$.schedule`) |
| POST | `/config/apply` | Apply a config patch (merge or replace) |
| GET | `/queue` | Queue state: current (with phase), overrides, automatic, pending |
| POST | `/queue/clear` | Remove all override queue entries |
| PATCH | `/metas/:path` | Update user-settable reserved properties (`_steer`, `_emphasis`, `_depth`, `_crossRefs`, `_disabled`) |

## Configuration

See the [Configuration Guide](guides/configuration.md) for all fields, defaults, and environment variable substitution.

## Documentation

- **[Guides](guides/index.md)** — concepts, configuration, orchestration, scheduling, architecture
- **[CLI Reference](guides/cli.md)** — all commands with usage

## License

BSD-3-Clause

