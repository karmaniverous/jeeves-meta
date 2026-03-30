---
title: Orchestration
---

# Orchestration

The `orchestrate()` function runs a single synthesis cycle in 13 steps:

1. **Discover** — walk watcher filesystem for `.meta/meta.json` files (no Qdrant dependency)
2. **Read** — parse `meta.json` for each discovered path
3. **Build tree** — construct the ownership tree from valid paths
4. **Select candidate** — rank by effective staleness, acquire lock on winner
5. **Compute context** — scope files, delta files, child meta outputs, previous content/feedback
6. **Structure hash** — SHA-256 of sorted scope file listing (computed from context)
7. **Steer detection** — compare current `_steer` vs latest archive
8. **Architect** (conditional) — runs if: no cached builder, structure changed, steer changed, or periodic refresh
9. **Builder** — executes the architect's brief, produces `_content` + structured fields
10. **Critic** — evaluates the synthesis, produces `_feedback`
11. **Merge & finalize** — stage result in `.lock`, copy to `meta.json`
12. **Archive & prune** — create timestamped archive snapshot, prune beyond `maxArchive`
13. **Release lock** — delete `.lock` file (in `finally` block)

### Module Structure

The orchestration pipeline is split into focused modules following SOLID/DRY principles:

| Module | Responsibility |
|--------|---------------|
| `orchestrate.ts` | Discovery, staleness ranking, lock management, delegates to `synthesizeNode` |
| `synthesizeNode.ts` | Single-node architect → builder → critic pipeline |
| `finalizeCycle.ts` | Lock-staged writes: `.lock` → `meta.json` → archive → prune |
| `timeoutRecovery.ts` | `SpawnTimeoutError` recovery with partial `_state` salvage |

### Error Handling

- **Architect failure with cached builder**: continues with existing `_builder`
- **Architect failure without cached builder**: cycle ends, error recorded
- **Builder failure**: cycle ends, error recorded
- **Builder timeout (`SpawnTimeoutError`)**: attempts to salvage advanced `_state` from partial output via `timeoutRecovery`; if `_state` progressed, it is persisted (state-only finalize) and the cycle is recorded as a partial success
- **Critic failure**: synthesis is preserved, error attached
- **Errors never block the queue**: logged, reported, queue advances

### Lock Staging ("Never Write Worse")

Results are staged in `.lock` before being committed to `meta.json`. If the process crashes:
- Before staging: `meta.json` is untouched
- After staging, before commit: `meta.json` is untouched; stale `.lock` cleaned at next startup
- After commit: synthesis is preserved

