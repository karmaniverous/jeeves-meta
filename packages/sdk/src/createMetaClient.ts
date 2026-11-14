/**
 * @module createMetaClient
 * Typed meta API client built on jeeves' catalog client (Decision 186): one method per `META_CATALOG` entry, named by the entry, each taking its input and optional per-call options; every failure is a {@link MetaError}. Network I/O via fetch.
 */

import {
  type CatalogClient,
  CatalogClientError,
  type CatalogInput,
  type ClientResponse,
  createCatalogClient,
} from '@karmaniverous/jeeves/catalog';
import {
  META_CATALOG,
  type MetaCatalog,
} from '@karmaniverous/jeeves-meta-core';

import {
  checkTimeout,
  type MetaClientOptions,
  resolveClientOptions,
} from './options.js';
import { toMetaError } from './toMetaError.js';

/** Options for one call. */
export interface CallOptions {
  /** Timeout of this call in milliseconds (overrides the client's). */
  timeoutMs?: number;
}

/** The client method for catalog entry `E`: input optional when no field is required. */
type MethodOf<E extends MetaCatalog['entries'][number]> =
  Partial<CatalogInput<E>> extends CatalogInput<E>
    ? (
        input?: CatalogInput<E>,
        options?: CallOptions,
      ) => Promise<ClientResponse<E>>
    : (
        input: CatalogInput<E>,
        options?: CallOptions,
      ) => Promise<ClientResponse<E>>;

/**
 * A meta API client: one method per `META_CATALOG` entry, named by the
 * entry (`status`, `listMetas`, `metaDetail`, `synthesize`, ...). Every
 * method validates its input against the entry's schemas before sending,
 * parses the response with the entry's response schema, and throws a
 * {@link MetaError} on any failure. No retries.
 */
export type MetaClient = {
  [E in MetaCatalog['entries'][number] as E['name']]: MethodOf<E>;
};

/**
 * Create a meta API client.
 *
 * @example
 * ```ts
 * const meta = createMetaClient({ baseUrl: 'http://127.0.0.1:1938' });
 * const { owedPhase } = await meta.synthesize({ path: 'j:/domains/x' });
 * ```
 *
 * @param options - Base URL, timeout (default 120 s) and `fetch`.
 * @returns A {@link MetaClient}.
 * @throws {@link MetaError} `invalid_options` when the options are invalid.
 */
export function createMetaClient(options: MetaClientOptions): MetaClient {
  const resolved = resolveClientOptions(options);

  // jeeves' catalog client takes one timeout, so keep one per timeout used.
  const clients = new Map<number, CatalogClient<MetaCatalog>>();
  const clientFor = (timeoutMs: number): CatalogClient<MetaCatalog> => {
    const existing = clients.get(timeoutMs);
    if (existing) return existing;
    const created = createCatalogClient(META_CATALOG, {
      baseUrl: resolved.baseUrl,
      timeoutMs,
      fetch: resolved.fetch,
    });
    clients.set(timeoutMs, created);
    return created;
  };

  const methods = META_CATALOG.entries.map(({ name }) => {
    const method = async (input?: unknown, call: CallOptions = {}) => {
      const timeoutMs =
        call.timeoutMs === undefined
          ? resolved.timeoutMs
          : checkTimeout('timeoutMs', call.timeoutMs);
      const send = clientFor(timeoutMs)[name] as (
        input?: unknown,
      ) => Promise<unknown>;
      try {
        return await send(input);
      } catch (error) {
        const text =
          error instanceof CatalogClientError && error.headers
            ? resolved.errorTexts.get(error.headers)
            : undefined;
        throw toMetaError(error, name, timeoutMs, text);
      }
    };
    return [name, method] as const;
  });
  return Object.fromEntries(methods) as unknown as MetaClient;
}
