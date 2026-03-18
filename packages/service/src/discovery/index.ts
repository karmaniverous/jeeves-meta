/**
 * Discovery module — glob .meta/ directories and build ownership tree.
 *
 * @module discovery
 */

export { discoverMetas } from './discoverMetas.js';
export {
  listMetas,
  type MetaEntry,
  type MetaListResult,
  type MetaListSummary,
} from './listMetas.js';
export { buildOwnershipTree, findNode } from './ownershipTree.js';
export {
  filterInScope,
  getDeltaFiles,
  getScopeFiles,
  getScopePrefix,
} from './scope.js';
export type { MetaNode, OwnershipTree } from './types.js';
