---
title: Tools Reference
---

# Tools Reference

All tools delegate to the jeeves-meta HTTP service.

## meta_list

List metas with summary stats and per-meta projection.

**Parameters:**
- `pathPrefix` (string, optional) — filter by path prefix
- `filter` (object, optional) — structured filter: `hasError`, `staleHours`, `neverSynthesized`, `locked`
- `fields` (string[], optional) — fields to include per meta

**Response:** `{ summary, metas }`

## meta_detail

Full detail for a single meta with optional archive history.

**Parameters:**
- `path` (string, required) — `.meta/` or owner directory path
- `fields` (string[], optional) — fields to include
- `includeArchive` (boolean | number, optional) — false, true (all), or N most recent

**Response:** `{ path, meta, scope, staleness, crossRefs?, archive? }`

When the meta has `_crossRefs`, the response includes a `crossRefs` status array:
```json
{ "crossRefs": [
  { "path": "j:/some/path", "status": "resolved", "hasContent": true },
  { "path": "j:/missing", "status": "missing" }
]}
```

## meta_preview

Dry-run: show what inputs would be gathered for the next synthesis cycle.

**Parameters:**
- `path` (string, optional) — specific path, or omit for stalest candidate

**Response:** `{ path, staleness, architectWillRun, architectReason, scope, estimatedTokens }`

## meta_trigger

Enqueue synthesis for a specific meta or the stalest candidate.

**Parameters:**
- `path` (string, optional) — specific path, or omit for stalest candidate

**Response:** `{ status: "accepted", path, queuePosition, alreadyQueued }`

## meta_seed

Create a `.meta/` directory with a skeleton `meta.json` for a new entity path.

**Parameters:**
- `path` (string, required) — owner directory path
- `crossRefs` (string, optional) — JSON array of cross-ref owner paths (e.g. `'["j:/path/a","j:/path/b"]'`). Written as `_crossRefs` in the initial `meta.json`.
- `steer` (string, optional) — steering prompt written as `_steer` in the initial `meta.json`

**Response:** `{ path, _id }` (201 Created) or 409 Conflict if already exists.

## meta_unlock

Remove a stale `.lock` file from a meta entity that is stuck.

**Parameters:**
- `path` (string, required) — `.meta/` or owner directory path

**Response:** `{ path, unlocked: true }` or 409 if already unlocked

## meta_config

Query the running service configuration with an optional JSONPath expression.

**Parameters:**
- `path` (string, optional) — JSONPath like `"$.port"` to query a specific field

**Response:** Full sanitized config (with `gatewayApiKey` redacted) or the specific field value

## meta_queue

Queue management: list pending items, clear the queue, or abort current synthesis.

**Parameters:**
- `action` (string, required) — one of `list`, `clear`, `abort`
  - `list` — show current queue state (current synthesis, pending items)
  - `clear` — remove all pending queue items
  - `abort` — stop the currently running synthesis and release its lock

**Response (list):** `{ current, pending, state }`
**Response (clear):** `{ cleared: <count> }`
**Response (abort):** `{ status: "aborted", path }` or 404 if nothing running

