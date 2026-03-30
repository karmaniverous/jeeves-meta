---
title: Concepts
---

# Concepts

## Meta Entities

A `.meta/` directory co-located with source content. Contains:
- `meta.json` — current synthesis state (content, prompts, tokens, errors)
- `archive/` — timestamped snapshots of previous syntheses
- `.lock` — transient lock file during active synthesis

## Ownership Tree

Meta entities form a hierarchy based on filesystem nesting. A `.meta/` directory **owns** its parent directory and all descendants, except subtrees that contain their own `.meta/`. Child meta syntheses are consumed as rollup inputs by parent metas.

## Synthesis Cycle

A three-step LLM pipeline:
1. **Architect** — analyzes scope structure, crafts a task brief (conditional: runs on structure change, steer change, or periodic refresh)
2. **Builder** — executes the brief, produces `_content` + structured fields
3. **Critic** — evaluates the synthesis, provides `_feedback` for the next cycle

## Cross-Meta References (`_crossRefs`)

A meta can declare explicit relationships to other metas via the `_crossRefs` property — an array of owner paths. Referenced metas' `_content` is included as context for the architect and builder steps (not the critic), enabling organizational views that aggregate across source domains without requiring data co-location.

Cross-refs form a heterarchical mesh orthogonal to the ownership tree. Cycles are permitted (A refs B, B refs A — each reads the other's last-synthesized content). No transitive closure: if A needs C's content, declare the ref explicitly.

Cross-ref freshness does NOT affect the referencing meta's staleness. Each meta synthesizes on its own schedule, avoiding dependency cascades.

## Staleness

A meta is stale when any file in its scope was modified after `_generatedAt`. The scheduler uses a weighted formula incorporating tree depth and per-meta emphasis to prioritize which meta to synthesize next.

## Progressive Synthesis (`_state`)

The builder can populate an opaque `_state` field in `meta.json` to carry forward intermediate progress across cycles. On timeout (`SpawnTimeoutError`), the service attempts to salvage any advanced `_state` from partial output — preserving progress even when the full synthesis fails.

## Lock Staging

Synthesis results are staged in a `.lock` file before being committed to `meta.json`. If the process crashes between staging and commit, `meta.json` is untouched — "never write worse."

