/**
 * @module jeeves-meta-sdk
 * Typed TypeScript client for the jeeves-meta HTTP API, built from jeeves-meta's endpoint catalog (`META_CATALOG`). Start with {@link createMetaClient}; every failure is a {@link MetaError}.
 */

export {
  type CallOptions,
  createMetaClient,
  type MetaClient,
} from './createMetaClient.js';
export {
  errorBodyText,
  isMetaError,
  type MetaClientErrorCode,
  MetaError,
  type MetaErrorCodeValue,
  type MetaErrorInit,
} from './MetaError.js';
export {
  DEFAULT_TIMEOUT_MS,
  type FetchLike,
  type MetaClientOptions,
} from './options.js';

// The meta's error codes and their statuses (spec 4.4.4).
export {
  META_ERROR_CODES,
  META_ERROR_STATUS,
  type MetaErrorCode,
} from '@karmaniverous/jeeves-meta-core';

// Request and response types, inferred from the catalog.
export type {
  MetaEntryName,
  MetaHealth,
  MetaInput,
  MetaResponse,
} from '@karmaniverous/jeeves-meta-core';
