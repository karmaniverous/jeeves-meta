---
title: Scheduling
---

# Scheduling

## Weighted Staleness Formula

```
effectiveStaleness = actualStaleness × (normalizedDepth + 1) ^ (depthWeight × emphasis)
```

- **actualStaleness**: seconds since `_generatedAt` (Infinity if never synthesized)
- **normalizedDepth**: tree depth shifted so minimum = 0
- **depthWeight**: config exponent (default 0.5). Set to 0 for pure staleness ordering
- **emphasis**: per-meta `_emphasis` multiplier (default 1). Higher = updates more often

## Phase-Addressable Scheduling

The scheduler uses the phase-state machine to select **one phase per tick** across the entire corpus, instead of enqueuing full synthesis cycles.

### Priority Bands

Phases are prioritized by band:
1. **Critic** (band 1) — highest priority (finishing work)
2. **Builder** (band 2) — middle priority
3. **Architect** (band 3) — lowest priority (starting new work)

Within each band, candidates are ranked by weighted staleness. The single highest-priority owed phase is selected per tick.

### Scheduler Behavior

The built-in croner scheduler runs on the configured cron expression (default: every 30 minutes).

Each tick:
1. **Auto-seed** — if `autoSeed` rules are configured, walk for matching directories via the watcher and seed any that lack a `.meta/` directory
2. Discover all metas via watcher `/walk` endpoint
3. **Derive phase state** — reconstruct `_phaseState` for legacy metas without it
4. **Auto-retry** — promote `failed` → `pending` for all failed phases
5. **Select phase candidate** — pick the highest-priority owed phase (critic > builder > architect, staleness tiebreak)
6. Enqueue the selected phase (if no candidates, increase backoff and return)
7. Check watcher uptime for restart detection → re-register virtual rules if needed

## Disabled Metas

Any meta with `_disabled: true` in its `meta.json` is excluded from automatic scheduling — the scheduler and the auto-select path of `POST /synthesize` both skip it. Manual triggers (`meta_trigger` with an explicit path or `POST /synthesize` with an explicit path) still run disabled metas on demand. Use `meta_update` (or `PATCH /metas/:path`) to toggle the flag.

## Adaptive Backoff

When no stale candidates are found:
- Backoff multiplier doubles (max 4×)
- Subsequent ticks are skipped based on `tickCount % backoffMultiplier`
- Backoff resets to 1× after **any successful phase execution** (not just full-cycle completion)

## Queue Processing (Three-Layer Model)

The synthesis queue has three layers:
1. **Current** — the currently running phase (path + phase + startedAt)
2. **Overrides** — explicitly triggered entries (via HTTP/tools), processed with highest priority
3. **Automatic** — scheduler-computed candidates, processed after overrides

Key behaviors:
- Single-threaded: one phase runs at a time
- Override entries are processed before automatic candidates
- Duplicate paths in overrides are rejected
- `POST /queue/clear` removes only override entries
- Errors are logged but don't block subsequent items
- Legacy `pending` and `state` fields remain for backward compatibility

