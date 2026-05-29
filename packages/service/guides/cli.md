---
title: CLI Reference
---

# CLI Reference

All commands support `-p, --port <port>` to specify the service port (default: 1938).

## `jeeves-meta start`

Start the HTTP service.

```bash
jeeves-meta start --config /path/to/config.json
# or: jeeves-meta start -c /path/to/config.json
# or: set JEEVES_META_CONFIG env var and omit --config
```

The config path is resolved from `--config` / `-c` flag first, then falls back to the `JEEVES_META_CONFIG` environment variable.

### Config Loading

- **`@file:` indirection** — string config values starting with `@file:` are replaced with the contents of the referenced file, resolved relative to the config file's directory. Used for `defaultArchitect` and `defaultCritic` prompts.
- **`${VAR}` substitution** — all string values undergo environment variable substitution. Unset variables cause a startup error.

## `jeeves-meta status`

Show service health, queue state, dependency status, and meta summary.

## `jeeves-meta list`

List all discovered meta entities with summary statistics.

## `jeeves-meta detail <path>`

Show full detail for a single meta entity, including scope info and staleness score.

## `jeeves-meta preview [--path <path>]`

Dry-run: preview inputs for the next synthesis cycle without running any LLM calls. Shows scope files, delta files, architect trigger reasons, and token estimates.

## `jeeves-meta synthesize [--path <path>]`

Enqueue a synthesis. If `--path` is provided, that specific meta is enqueued with priority. Otherwise, the stalest candidate is discovered and enqueued.

## `jeeves-meta seed <path>`

Create a `.meta/` directory with a fresh `meta.json` (containing a new UUID `_id`).

## `jeeves-meta unlock <path>`

Remove a `.lock` file from a meta entity. Use when a lock is stale due to a crashed synthesis.

## `jeeves-meta abort`

Abort the currently running synthesis and release its lock.

## `jeeves-meta prune`

Prune old archive snapshots beyond `maxArchive` for all metas.

## `jeeves-meta queue list`

Show the current queue state (three-layer model: current, overrides, automatic).

## `jeeves-meta queue clear`

Remove all pending items from the override queue.

## `jeeves-meta config [-c <config-path>]`

Query the active service config (or validate a candidate config file locally). Supports JSONPath via `-c` for local files or queries the running service's `GET /config` endpoint.

## `jeeves-meta service install|start|stop|status|remove`

Print OS-specific instructions for managing the service as a system daemon (NSSM on Windows, launchd on macOS, systemd on Linux).

