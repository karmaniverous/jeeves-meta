/**
 * Retrieve the nearest ancestor meta node from the ownership tree.
 *
 * @module discovery/getAncestorMeta
 */

import type { MetaNode } from './types.js';

/**
 * Get the nearest ancestor MetaNode for a given node.
 *
 * Walks up the ownership tree (via the parent pointer set by
 * buildOwnershipTree) to find the closest ancestor .meta/ directory.
 *
 * @param node - The meta node to find the ancestor for.
 * @returns The parent MetaNode, or null for root-level metas.
 */
export function getAncestorMeta(node: MetaNode): MetaNode | null {
  return node.parent;
}
