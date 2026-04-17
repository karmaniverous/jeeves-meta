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
import { hasSteerChanged } from '../scheduling/staleness.js';
import type { MetaConfig, MetaJson, PhaseState } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';
import { invalidateArchitect, invalidateBuilder } from './phaseTransitions.js';

/** Architect-level invalidation reasons. */
export type ArchitectInvalidator =
  | 'structureHash'
  | 'steer'
  | '_architect'
  | '_crossRefs'
  | 'architectEvery';

/** Staleness inputs for a meta (exposed in /preview). */
export interface StalenessInputs {
  structureHash: string;
  steerChanged: boolean;
  architectChanged: boolean;
  crossRefsDeclChanged: boolean;
  scopeMtimeMax: string | null;
  crossRefContentChanged: boolean;
}

/** Result of computing invalidation for a single meta. */
export interface InvalidationResult {
  phaseState: PhaseState;
  architectInvalidators: ArchitectInvalidator[];
  stalenessInputs: StalenessInputs;
  structureHash: string;
  steerChanged: boolean;
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

  // _architect change: compare current vs. archive
  const architectChanged = latestArchive
    ? (meta._architect ?? '') !== (latestArchive._architect ?? '')
    : Boolean(meta._architect);

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
  if (structureChanged) architectInvalidators.push('structureHash');
  if (steerChanged) architectInvalidators.push('steer');
  if (architectChanged) architectInvalidators.push('_architect');
  if (crossRefsDeclChanged) architectInvalidators.push('_crossRefs');
  if ((meta._synthesisCount ?? 0) >= config.architectEvery) {
    architectInvalidators.push('architectEvery');
  }

  // First-run check: no _builder means architect must run
  const firstRun = !meta._builder;

  if (architectInvalidators.length > 0 || firstRun) {
    phaseState = invalidateArchitect(phaseState);
  }

  // ── Builder-level inputs ──
  // Scope file mtime check — if any file newer than _generatedAt
  const scopeMtimeMax: string | null = null;
  // Note: actual mtime check is done by the caller or via isStale;
  // here we just detect cross-ref content changes for the cascade.

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
  if (
    crossRefContentChanged &&
    architectInvalidators.length === 0 &&
    !firstRun
  ) {
    phaseState = invalidateBuilder(phaseState);
  }

  return {
    phaseState,
    architectInvalidators,
    stalenessInputs: {
      structureHash,
      steerChanged,
      architectChanged,
      crossRefsDeclChanged,
      scopeMtimeMax,
      crossRefContentChanged,
    },
    structureHash,
    steerChanged,
  };
}
