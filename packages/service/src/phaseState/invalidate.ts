/**
 * Per-tick invalidation pass.
 *
 * Computes architect-invalidating and builder-invalidating inputs for a meta,
 * then applies the cascade to update _phaseState.
 *
 * @module phaseState/invalidate
 */

import { readLatestArchive } from '../archive/index.js';
import type { MetaNode } from '../discovery/types.js';
import {
  DEFAULT_ARCHITECT_PROMPT,
  DEFAULT_CRITIC_PROMPT,
} from '../prompts/index.js';
import { hasSteerChanged } from '../scheduling/staleness.js';
import type { MetaConfig, MetaJson, PhaseState } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import { invalidateArchitect, invalidateBuilder } from './phaseTransitions.js';

/**
 * Check whether a persisted prompt snapshot mismatches the currently-resolved prompt.
 * Returns true when the snapshot exists and differs from the resolved prompt.
 * This is informational only — it does NOT trigger invalidation.
 */
function isPromptStale(
  snapshot: string | undefined,
  resolved: string,
): boolean {
  return snapshot !== undefined && snapshot !== resolved;
}

/** Architect-level invalidation reasons. */
export type ArchitectInvalidator =
  | 'structureHash'
  | 'steer'
  | '_crossRefs'
  | 'firstRun'
  | 'architectEvery';

/** Informational input status for a meta (exposed in /preview). */
export interface InputStatus {
  structureHash: string;
  steerChanged: boolean;
  architectChanged: boolean;
  criticChanged: boolean;
  crossRefsDeclChanged: boolean;
  crossRefContentChanged: boolean;
}

/** Result of computing invalidation for a single meta. */
export interface InvalidationResult {
  phaseState: PhaseState;
  architectInvalidators: ArchitectInvalidator[];
  inputStatus: InputStatus;
}

/**
 * Compute invalidation inputs and apply cascade for a single meta.
 *
 * @param meta - Current meta.json content with existing _phaseState.
 * @param scopeFiles - Sorted file list from scope.
 * @param config - MetaConfig for architectEvery.
 * @param node - MetaNode for archive access.
 * @param crossRefMetas - Map of cross-ref owner paths to their current _content.
 * @param archiveCrossRefContent - Map of cross-ref owner paths to their archived _content.
 * @returns Updated phase state and invalidation details.
 */
export async function computeInvalidation(
  meta: MetaJson,
  scopeFiles: string[],
  config: MetaConfig,
  node: MetaNode,
  crossRefMetas?: Map<string, string | undefined>,
  archiveCrossRefContent?: Map<string, string | undefined>,
): Promise<InvalidationResult> {
  let phaseState = meta._phaseState ?? {
    architect: 'fresh',
    builder: 'fresh',
    critic: 'fresh',
  };

  // ── Architect-level inputs ──
  const structureHash = computeStructureHash(scopeFiles);
  const structureChanged = structureHash !== meta._structureHash;

  const latestArchive = await readLatestArchive(node.metaPath);
  const steerChanged = hasSteerChanged(
    meta._steer,
    latestArchive?._steer,
    Boolean(latestArchive),
  );

  // Prompt staleness detection: compare persisted prompt snapshots against
  // currently-resolved prompts.  This is INFORMATIONAL ONLY — reported via
  // inputStatus so /preview can surface it, but it must NEVER feed into
  // the invalidation cascade.  When a meta naturally reaches architectEvery
  // through real builder cycles, architect runs with the current prompt and
  // the snapshot updates.  Coupling prompt changes to invalidation causes a
  // corpus-wide synthesis storm (see #163).
  const architectChanged = isPromptStale(
    meta._architect,
    DEFAULT_ARCHITECT_PROMPT,
  );
  const criticChanged = isPromptStale(meta._critic, DEFAULT_CRITIC_PROMPT);
  const effectiveSynthesisCount = meta._synthesisCount ?? 0;

  // _crossRefs declaration change
  const currentRefs = (meta._crossRefs ?? []).slice().sort().join(',');
  const archiveRefs = (latestArchive?._crossRefs ?? [])
    .slice()
    .sort()
    .join(',');
  const crossRefsDeclChanged = latestArchive
    ? currentRefs !== archiveRefs
    : currentRefs.length > 0;

  const architectInvalidators: ArchitectInvalidator[] = [];
  if (structureChanged) {
    if (meta._state !== undefined) {
      // Progressive entity: new files → builder only (cursor handles incremental)
      phaseState = invalidateBuilder(phaseState);
    } else {
      architectInvalidators.push('structureHash');
    }
  }
  if (steerChanged) architectInvalidators.push('steer');
  if (crossRefsDeclChanged) architectInvalidators.push('_crossRefs');
  if (effectiveSynthesisCount >= config.architectEvery) {
    architectInvalidators.push('architectEvery');
  }

  if (!meta._builder) architectInvalidators.push('firstRun');

  if (architectInvalidators.length > 0) {
    phaseState = invalidateArchitect(phaseState);
  }

  // ── Builder-level inputs ──

  // Cross-ref _content change (builder-invalidating)
  let crossRefContentChanged = false;
  if (crossRefMetas && archiveCrossRefContent) {
    for (const [refPath, currentContent] of crossRefMetas) {
      const archivedContent = archiveCrossRefContent.get(refPath);
      if (currentContent !== archivedContent) {
        crossRefContentChanged = true;
        break;
      }
    }
  }

  // Builder invalidation: scope mtime advances OR cross-ref content changes
  // Scope mtime is already captured by the staleness detection in the caller;
  // here we apply cross-ref content change cascade.
  if (crossRefContentChanged && architectInvalidators.length === 0) {
    phaseState = invalidateBuilder(phaseState);
  }

  return {
    phaseState,
    architectInvalidators,
    inputStatus: {
      structureHash,
      steerChanged,
      architectChanged,
      criticChanged,
      crossRefsDeclChanged,
      crossRefContentChanged,
    },
  };
}
