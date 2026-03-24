/**
 * Seed module — create .meta/ directories with initial meta.json.
 *
 * @module seed
 */

export { autoSeedPass, type AutoSeedResult } from './autoSeed.js';
export {
  createMeta,
  type CreateMetaOptions,
  type CreateMetaResult,
  metaExists,
} from './createMeta.js';
