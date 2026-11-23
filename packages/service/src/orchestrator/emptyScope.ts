/**
 * Empty-scope guard (§3.9, #177): detect metas with nothing to synthesize
 * and mark them fresh without spending tokens.
 *
 * @module orchestrator/emptyScope
 */

import type { MetaNode } from '../discovery/types.js';
import type { MinimalLogger } from '../logger/index.js';
import { freshPhaseState } from '../phaseState/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { persistPhaseState } from './runPhase.js';

/**
 * Check whether a meta has an empty scope — no source files, no children,
 * no cross-refs, and no prior content. Matches §3.9 empty-scope criteria.
 */
export function isEmptyScope(
  scopeFiles: string[],
  node: MetaNode,
  meta: MetaJson,
): boolean {
  return (
    scopeFiles.length === 0 &&
    node.children.length === 0 &&
    (!meta._crossRefs || meta._crossRefs.length === 0) &&
    !meta._content
  );
}

/**
 * Handle an empty-scope meta: set all phases fresh, bump _generatedAt.
 * Prevents perpetual staleness without wasting tokens on synthesis.
 */
export async function handleEmptyScope(
  node: MetaNode,
  currentMeta: MetaJson,
  config: MetaConfig,
  structureHash: string,
  logger?: MinimalLogger,
): Promise<void> {
  await persistPhaseState(
    {
      metaPath: node.metaPath,
      current: currentMeta,
      config,
      structureHash,
    },
    freshPhaseState(),
    { _generatedAt: new Date().toISOString() },
  );
  logger?.info(
    { path: node.ownerPath },
    'Empty scope — set all phases fresh, bumped _generatedAt',
  );
}
