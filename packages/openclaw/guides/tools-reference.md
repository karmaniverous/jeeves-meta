---
title: Tools Reference
---

# Tools Reference

## synth_list

List metas with summary statistics and per-meta projection.

**Parameters:**
- `pathPrefix?` — filter by path prefix (e.g. `github/`)
- `filter?` — structured filter: `{ hasError: true }`, `{ staleHours: 24 }`, `{ neverSynthesized: true }`, `{ locked: true }`
- `fields?` — projection array (default: path, depth, emphasis, stalenessSeconds, lastSynthesized, hasError, locked, architectTokens, builderTokens, criticTokens)

**Returns:** Summary object (total, stale, errors, locked, neverSynthesized, token totals) plus filtered item list.

## synth_detail

Full detail for a single meta with optional archive history.

**Parameters:**
- `path` (required) — `.meta/` or owner directory path
- `fields?` — property projection (default: all except _architect, _builder, _critic, _content, _feedback)
- `includeArchive?` — `false` (default), `true` (all), or `number` (N most recent)

**Returns:** Full meta.json content plus optional archive entries.

## synth_trigger

Manually trigger synthesis for a specific meta or next-stalest.

**Parameters:**
- `path?` — target `.meta/` path (omit for next-stalest)

**Returns:** Orchestration result with synthesis outcome.

## synth_preview

Dry-run showing what inputs would be gathered without invoking LLM steps.

**Parameters:**
- `path?` — target `.meta/` path (omit for next-stalest)

**Returns:** Context package preview: scope files, delta files, child outputs, staleness info.
