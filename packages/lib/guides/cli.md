---
title: CLI Reference
---

# CLI Reference

The jeeves-meta CLI provides ad hoc invocation, debugging, and maintenance commands.

## Usage

```bash
npx @karmaniverous/jeeves-meta <command> [options]
```

## Config Resolution

All commands except `seed` and `unlock` require a config file:

1. `--config <path>` flag (highest priority)
2. `JEEVES_META_CONFIG` environment variable
3. Error if neither is set

## Global Options

| Option | Description |
|--------|-------------|
| `--config <path>` | Path to `jeeves-meta.config.json` |
| `--json` | Output as JSON (default: pretty-printed JSON) |
| `--help`, `-h` | Show usage |

## Commands

### status

Summary statistics for the entire synthesis fleet.

```bash
npx @karmaniverous/jeeves-meta status --config config.json
```

**Output:** total, stale, errors, locked, neverSynthesized, token totals.

### list

List metas with filtering.

```bash
npx @karmaniverous/jeeves-meta list [--prefix <p>] [--filter <f>]
```

| Option | Description |
|--------|-------------|
| `--prefix <p>` | Filter by path substring |
| `--filter <f>` | One of: `hasError`, `stale`, `locked`, `never` |

### detail

Full detail for a single meta.

```bash
npx @karmaniverous/jeeves-meta detail <path> [--archive <n>]
```

| Option | Description |
|--------|-------------|
| `<path>` | `.meta/` directory or owner directory path |
| `--archive <n>` | Include N most recent archive snapshots |

### preview

Dry-run: show what inputs would be gathered without invoking LLM steps.

```bash
npx @karmaniverous/jeeves-meta preview [--path <p>]
```

If `--path` is omitted, previews the stalest candidate.

**Output:** target, scope files count, delta detection, structure changes, steer changes, architect trigger reasons.

### synthesize

Run synthesis cycle(s).

```bash
npx @karmaniverous/jeeves-meta synthesize [--path <p>] [--batch <n>]
```

| Option | Description |
|--------|-------------|
| `--path <p>` | Target a specific meta (omit for next-stalest) |
| `--batch <n>` | Override `batchSize` for this run |

This is the command used by jeeves-runner cron jobs.

### seed

Create a new `.meta/` directory with a fresh `meta.json` (UUID only). Does not require config.

```bash
npx @karmaniverous/jeeves-meta seed <path>
```

### unlock

Force-remove a `.lock` file from a `.meta/` directory. Does not require config.

```bash
npx @karmaniverous/jeeves-meta unlock <path>
```

### validate

Validate config and check service reachability (watcher + gateway).

```bash
npx @karmaniverous/jeeves-meta validate
```

**Output:** config validity, watcher status, gateway status, discovered meta count.

### config show

Dump the resolved config (prompts truncated for readability).

```bash
npx @karmaniverous/jeeves-meta config show
```

### config check

Alias for `validate`.

```bash
npx @karmaniverous/jeeves-meta config check
```
