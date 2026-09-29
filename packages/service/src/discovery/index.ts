/**
 * Discovery module — glob .meta/ directories and build ownership tree.
 *
 * @module discovery
 */

export { getAncestorMeta } from './getAncestorMeta.js';
export { listMetas, type MetaListResult } from './listMetas.js';
export { findNode } from './ownershipTree.js';
export { getDeltaFiles, getScopeFiles } from './scope.js';
export type { MetaNode } from './types.js';
