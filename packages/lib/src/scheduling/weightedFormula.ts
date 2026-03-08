/**
 * Weighted staleness formula for candidate selection.
 *
 * effectiveStaleness = actualStaleness * (normalizedDepth + 1) ^ depthWeight
 *
 * @module scheduling/weightedFormula
 */

import type { MetaNode } from '../discovery/index.js';
import type { MetaJson } from '../schema/index.js';

/** A candidate meta with computed staleness. */
export interface StalenessCandidate {
  /** The meta node. */
  node: MetaNode;
  /** Current meta.json content. */
  meta: MetaJson;
  /** Actual staleness in seconds. */
  actualStaleness: number;
  /** Effective staleness after depth weighting. */
  effectiveStaleness: number;
}

/**
 * Compute effective staleness for a set of candidates.
 *
 * Normalizes depths so the minimum becomes 0, then applies the formula:
 * effectiveStaleness = actualStaleness * (normalizedDepth + 1) ^ depthWeight
 *
 * @param candidates - Array of { node, meta, actualStaleness }.
 * @param depthWeight - Exponent for depth weighting (0 = pure staleness).
 * @returns Same array with effectiveStaleness computed.
 */
export function computeEffectiveStaleness(
  candidates: Array<{
    node: MetaNode;
    meta: MetaJson;
    actualStaleness: number;
  }>,
  depthWeight: number,
): StalenessCandidate[] {
  if (candidates.length === 0) return [];

  // Get depth for each candidate: use _depth override or tree depth
  const depths = candidates.map((c) => c.meta._depth ?? c.node.treeDepth);

  // Normalize: shift so minimum becomes 0
  const minDepth = Math.min(...depths);
  const normalizedDepths = depths.map((d) => Math.max(0, d - minDepth));

  return candidates.map((c, i) => ({
    ...c,
    effectiveStaleness:
      c.actualStaleness * Math.pow(normalizedDepths[i] + 1, depthWeight),
  }));
}
