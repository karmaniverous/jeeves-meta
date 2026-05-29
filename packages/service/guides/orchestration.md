---
title: Orchestration
---

# Orchestration

The `orchestratePhase()` function runs **one phase per tick** using the phase-state machine:

1. **Discover** — walk watcher filesystem for `.meta/meta.json` files (no Qdrant dependency)
2. **Read** — parse `meta.json` for each discovered path
3. **Derive phase state** — `derivePhaseState()` reconstructs `_phaseState` from legacy fields on first load
4. **Auto-retry** — failed phases are promoted from `failed` → `pending`
5. **Select candidate** — `selectPhaseCandidate()` picks the highest-priority owed phase across the corpus (critic > builder > architect, weighted staleness tiebreak)
6. **Execute phase** — run exactly one of `runArchitect`, `runBuilder`, or `runCritic`
7. **Persist** — lock-staged write of updated `_phaseState` and phase output
8. **Archive** (on full-cycle only) — when all three phases are `fresh`, create snapshot and prune

### Phase-State Machine

Each meta carries `_phaseState: { architect, builder, critic }` where each value is one of: `fresh`, `stale`, `pending`, `running`, `failed`.

**Invariant:** At most one phase is `pending` or `running`, and it is the first non-fresh phase in pipeline order. When `enforceInvariant()` runs after every transition, stale phases that become the first non-fresh phase are promoted to `pending`; non-first `pending` phases are demoted to `stale`.

**Key transitions:**
- Architect invalidated → `architect: pending` (downstream `fresh` phases become `stale`; already non-fresh phases keep their state). Triggers: structure hash change, steer change, cross-refs declaration change, `_synthesisCount` ≥ `architectEvery`, or first run (no `_builder`).
- **Progressive metas** (`_state` present): structure changes invalidate builder instead of architect, since the cursor handles incremental processing.
- Builder invalidated (cross-ref content change, when architect is fresh and not first run) → `builder: pending`; `critic` → `stale` if was `fresh`. When architect is not fresh, builder stays `stale` (not promoted to `pending`).
- Architect success → `architect: fresh`, `builder: pending` (or stays `failed`), `critic` → `stale` if was `fresh`. Also resets `_synthesisCount` to 0.
- Builder success → `builder: fresh`, `critic: pending` (or stays `failed`). Architect state preserved.
- Critic success → `critic: fresh`; if all three fresh → full-cycle complete (archive via `createSnapshot()`, `pruneArchive()`, then increment `_synthesisCount`)
- Any phase failure → that phase: `failed`; other phases untouched (surgical retry)
- Phase selected for execution → transitions to `running` before executor spawns
- Next tick → `failed` phases promoted to `pending` for auto-retry

### Module Structure

| Module | Responsibility |
|--------|---------------|
| `orchestratePhase.ts` | Per-tick driver: discover → derive → select → execute one phase |
| `runPhase.ts` | Per-phase executors: `runArchitect`, `runBuilder`, `runCritic` |
| `synthesizeNode.ts` | Legacy single-node full pipeline (retained for compatibility) |
| `finalizeCycle.ts` | Legacy lock-staged writes |

### Error Handling

- **Phase failure**: the phase transitions to `failed`; other phases are untouched
- **Auto-retry**: failed phases are promoted to `pending` on the next scheduler tick
- **Architect failure with cached builder**: engine can still run builder on next tick
- **Builder timeout (`SpawnTimeoutError`)**: attempts to salvage advanced `_state` from partial output; if `_state` progressed, it is persisted alongside the `failed` phase state
- **Errors never block the queue**: logged, reported, queue advances

### Lock Staging ("Never Write Worse")

Results are staged in `.lock` before being committed to `meta.json`. If the process crashes:
- Before staging: `meta.json` is untouched
- After staging, before commit: `meta.json` is untouched; stale `.lock` cleaned at next startup
- After commit: synthesis is preserved

