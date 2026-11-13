/**
 * Shared core types and schemas for jeeves-meta packages.
 *
 * @packageDocumentation
 */

export type {
  MetaCatalog,
  MetaEntry,
  MetaEntryName,
  MetaHealth,
  MetaInput,
  MetaResponse,
} from './catalog.js';
export { META_CATALOG } from './catalog.js';
export { metaHealthSchema } from './catalog/health.js';
export {
  metaDetailQuerySchema,
  metasQuerySchema,
  previewQuerySchema,
  seedBodySchema,
  synthesizeBodySchema,
  unlockBodySchema,
  updateBodySchema,
} from './catalog/requests.js';
export {
  abortResponseSchema,
  configApplyResponseSchema,
  metaDetailResponseSchema,
  metaListSummarySchema,
  metasItemSchema,
  metasResponseSchema,
  previewResponseSchema,
  queueClearResponseSchema,
  queueResponseSchema,
  seedResponseSchema,
  synthesizeResponseSchema,
  unlockResponseSchema,
  updateMetaResponseSchema,
} from './catalog/responses.js';
export { META_COMPONENT } from './constants.js';
export type {
  DepHealth,
  GatewayDepHealth,
  MetaListSummary,
  MetasItem,
  MetasResponse,
  NextPhaseCandidate,
  PhaseStateSummary,
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
export type { MetaErrorCode } from './errorCodes.js';
export { META_ERROR_CODES, META_ERROR_STATUS } from './errorCodes.js';
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
