/**
 * Shared core types and schemas for jeeves-meta packages.
 *
 * @packageDocumentation
 */

export { META_COMPONENT } from './constants.js';
export type {
  DepHealth,
  GatewayDepHealth,
  MetaListSummary,
  MetasItem,
  MetasResponse,
  ServiceState,
  WatcherDepHealth,
} from './contracts.js';
export type {
  Endpoint,
  EndpointDescriptor,
  EndpointName,
  HttpMethod,
} from './endpoints.js';
export { getEndpoint, META_ENDPOINTS } from './endpoints.js';
export type { MetaError } from './errors.js';
export { metaErrorSchema } from './errors.js';
export type { MetaConfig } from './metaConfig.js';
export { metaConfigSchema } from './metaConfig.js';
export { normalizePath } from './normalizePath.js';
export type { PhaseName, PhaseState, PhaseStatus } from './phases.js';
export {
  phaseNames,
  phaseStateSchema,
  phaseStatuses,
  phaseStatusSchema,
} from './phases.js';
