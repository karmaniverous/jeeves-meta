/**
 * Descriptions of jeeves-meta's own (non-standard) endpoints, shared by
 * `META_CATALOG` and the deprecated `META_ENDPOINTS`, so OpenAPI, the SDK
 * and the plugin tools describe each endpoint in one wording. Pure data.
 *
 * @module descriptions
 */

/** Description of each jeeves-meta endpoint, keyed by entry name. */
export const ENDPOINT_DESCRIPTIONS = {
  listMetas:
    'List metas with summary stats and per-meta projection. Response includes phaseState and owedPhase per meta.',
  metaDetail:
    'Full detail for a single meta, with optional archive history. Response includes phaseState, owedPhase, and crossRefs.',
  updateMeta:
    'Update user-settable reserved properties on a meta entity. Returns { path, meta } with large fields excluded. Rejects unknown property keys with a 400 error.',
  synthesize:
    'Trigger synthesis. Path-targeted creates an override queue entry; returns owedPhase. Fully-fresh metas return status:skipped.',
  abort: 'Abort the currently running synthesis.',
  preview:
    'Dry-run preview of next synthesis. Returns owedPhase, priorityBand, phaseState, inputStatus, and architectInvalidators.',
  seed: 'Create a .meta/ directory and initial meta.json for a new entity path.',
  unlock: 'Remove a stale .lock from a meta entity that is stuck.',
  configApply: 'Apply a configuration patch.',
  queue:
    'List queued synthesis operations (3-layer model: current, overrides, automatic).',
  queueClear: 'Clear override entries from the queue.',
} as const;
