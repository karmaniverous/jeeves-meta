/**
 * Re-exports for all schema modules.
 *
 * @module schema
 */

export {
  type AutoSeedRule,
  type MetaConfig,
  metaConfigSchema,
  type ServiceConfig,
  serviceConfigSchema,
} from './config.js';
export { type MetaError, metaErrorSchema } from './error.js';
export {
  type MetaJson,
  metaJsonSchema,
  type PhaseName,
  phaseNames,
  type PhaseState,
  phaseStateSchema,
  type PhaseStatus,
  phaseStatuses,
} from './meta.js';
