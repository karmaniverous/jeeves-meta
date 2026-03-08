/**
 * Knowledge synthesis engine for the Jeeves platform.
 *
 * @packageDocumentation
 */

export {
  createSnapshot,
  pruneArchive,
  readLatestArchive,
} from './archive/index.js';
export {
  buildOwnershipTree,
  ensureMetaJson,
  filterInScope,
  getScopeExclusions,
  getScopePrefix,
  globMetas,
  type MetaNode,
  type OwnershipTree,
} from './discovery/index.js';
export type {
  InferenceRuleSpec,
  ScanFile,
  ScanParams,
  ScanResponse,
  SynthContext,
  SynthExecutor,
  SynthSpawnOptions,
  WatcherClient,
} from './interfaces/index.js';
export { acquireLock, isLocked, releaseLock } from './lock.js';
export {
  actualStaleness,
  computeEffectiveStaleness,
  isStale,
  selectCandidate,
  type StalenessCandidate,
} from './scheduling/index.js';
export {
  type MetaJson,
  metaJsonSchema,
  type SynthConfig,
  synthConfigSchema,
  type SynthError,
  synthErrorSchema,
} from './schema/index.js';
export { computeStructureHash } from './structureHash.js';
