---
title: Tools Reference
---

# Tools Reference

## synth_list

List metas with summary statistics and per-meta projection.

**Parameters:**
- `pathPrefix?` — filter by path prefix (e.g. `github/`)
- `filter?` — structured filter object:
  - `hasError`: `boolean` — only metas with/without errors
  - `staleHours`: `number` — only metas stale for at least N hours
  - `neverSynthesized`: `boolean` — only never-synthesized metas
  - `locked`: `boolean` — only locked/unlocked metas
- `fields?` — projection array (default: path, depth, emphasis, stalenessSeconds, lastSynthesized, hasError, locked, architectTokens, builderTokens, criticTokens, children)

**Returns:** Summary object (total, stale, errors, locked, neverSynthesized, token totals, stalestPath, lastSynthesizedPath/At) plus filtered item list sorted by path.

**Data source:** Queries watcher via `paginatedScan` with `synth-meta` domain filter (not filesystem).

## synth_detail

Full detail for a single meta with optional archive history.

**Parameters:**
- `path` (required) — `.meta/` or owner directory path
- `fields?` — property projection (default: all except _architect, _builder, _critic, _content, _feedback)
- `includeArchive?` — `false` (default), `true` (all), or `number` (N most recent)

**Returns:** Full meta.json content (projected) plus optional archive entries (most recent first).

**Data source:** Direct filesystem read of `meta.json` and archive files.

## synth_trigger

Manually trigger synthesis for a specific meta or next-stalest.

**Parameters:**
- `path?` — target `.meta/` or owner directory path (omit for next-stalest)

**Returns:** Synthesis outcome: count, per-meta results with error details if any.

**Note:** Runs the full 3-step LLM cycle (architect → builder → critic). Can take several minutes. Uses the `GatewayExecutor` with `gatewayUrl`/`gatewayApiKey` from config.

## synth_preview

Dry-run showing what inputs would be gathered without invoking LLM steps.

**Parameters:**
- `path?` — target `.meta/` or owner directory path (omit for next-stalest)

**Returns:**
- `target` — selected meta path
- `ownerPath` — owner directory
- `depth` — effective depth
- `staleness` — time since last synthesis
- `scopeFiles` — count + sample (first 20)
- `deltaFiles` — count + sample (files changed since last synthesis)
- `structureChanged` — whether file additions/removals detected
- `steerChanged` — whether `_steer` differs from latest archive
- `architectTriggered` — whether the architect step would run
- `architectTriggerReasons` — human-readable list of triggers
- `currentSteer` — current `_steer` value
- `hasExistingContent` / `hasExistingFeedback` — previous state
- `children` — child meta paths
