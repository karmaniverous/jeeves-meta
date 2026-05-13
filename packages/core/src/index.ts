/**
 * Shared core types and schemas for jeeves-meta packages.
 *
 * @packageDocumentation
 */

export { META_COMPONENT } from './constants.js';
export {
  type DepHealth,
  type GatewayDepHealth,
  type MetaListSummary,
  type MetasItem,
  type MetasResponse,
  type ServiceState,
  type WatcherDepHealth,
} from './contracts.js';
export { type MetaError, metaErrorSchema } from './errors.js';
export { type MetaConfig, metaConfigSchema } from './metaConfig.js';
export { normalizePath } from './normalizePath.js';
export {
  type PhaseName,
  phaseNames,
  type PhaseState,
  phaseStateSchema,
  type PhaseStatus,
  phaseStatuses,
  phaseStatusSchema,
} from './phases.js';
