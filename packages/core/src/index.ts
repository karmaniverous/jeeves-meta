/**
 * Shared core types and schemas for jeeves-meta packages.
 *
 * @packageDocumentation
 */

export { META_COMPONENT } from './constants.js';
export {
  DepHealth,
  GatewayDepHealth,
  MetaListSummary,
  MetasItem,
  MetasResponse,
  ServiceState,
  WatcherDepHealth,
} from './contracts.js';
export {
  Endpoint,
  EndpointDescriptor,
  EndpointName,
  getEndpoint,
  HttpMethod,
  META_ENDPOINTS,
} from './endpoints.js';
export { MetaError, metaErrorSchema } from './errors.js';
export { MetaConfig, metaConfigSchema } from './metaConfig.js';
export { normalizePath } from './normalizePath.js';
export {
  PhaseName,
  phaseNames,
  PhaseState,
  phaseStateSchema,
  PhaseStatus,
  phaseStatuses,
  phaseStatusSchema,
} from './phases.js';
