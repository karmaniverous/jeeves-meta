/**
 * @module options
 * Client options for `createMetaClient`, their validation, and the `fetch` adapter that keeps each non-2xx response body as received (for `MetaError.responseText`). Pure apart from wrapping `fetch`.
 */

import { MetaError } from './MetaError.js';

/**
 * Default per-call timeout: 120 s, jeeves' `DEFAULT_FETCH_TIMEOUT_MS`.
 */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** A `fetch`-compatible function (the global `fetch` by default). */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Options for `createMetaClient`. */
export interface MetaClientOptions {
  /** Base URL of the meta API, e.g. `http://127.0.0.1:1938`. May carry a path prefix; must not carry a query string or fragment. */
  baseUrl: string;
  /** Per-call timeout in milliseconds. Default: 120000. */
  timeoutMs?: number;
  /** `fetch` implementation (for tests or custom agents). Default: global `fetch`. */
  fetch?: FetchLike;
}

/** Validated, normalised client options. */
export interface ResolvedClientOptions {
  /** Base URL without trailing slashes. */
  baseUrl: string;
  /** Default timeout. */
  timeoutMs: number;
  /** The caller's fetch, adapted (see {@link captureErrorText}). */
  fetch: typeof fetch;
  /** Non-2xx body texts, keyed by the response's `Headers`. */
  errorTexts: WeakMap<Headers, string>;
}

const invalid = (message: string): MetaError =>
  new MetaError({ code: 'invalid_options', status: 0, message });

/** Statuses whose responses carry no body. */
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

/**
 * Adapt a {@link FetchLike} to the `fetch` signature jeeves' catalog client
 * takes, keeping the body text of every non-2xx response in `errorTexts`.
 *
 * @remarks
 * jeeves' client hands the response's own `Headers` object to the error it
 * throws (`CatalogClientError.headers`), so the text is found again by that
 * object. The client reads the body after this adapter, so the adapter
 * returns a fresh response with the same status, headers and text.
 *
 * @param fetchImpl - The caller's fetch.
 * @param errorTexts - Where non-2xx body texts are kept.
 * @returns A `typeof fetch` that calls `fetchImpl`.
 */
export function captureErrorText(
  fetchImpl: FetchLike,
  errorTexts: WeakMap<Headers, string>,
): typeof fetch {
  return async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const res = await fetchImpl(url, init ?? {});
    if (res.ok) return res;
    if (NULL_BODY_STATUSES.has(res.status)) {
      errorTexts.set(res.headers, '');
      return res;
    }
    const text = await res.text();
    const copy = new Response(text, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
    errorTexts.set(copy.headers, text);
    return copy;
  };
}

/**
 * Check a timeout option.
 *
 * @param name - Option name (for the message).
 * @param value - The value.
 * @returns The value.
 * @throws {@link MetaError} `invalid_options` unless positive and finite.
 */
export function checkTimeout(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0)
    throw invalid(`${name} must be a positive number`);
  return value;
}

/**
 * Validate and normalise client options.
 *
 * @param options - Caller options.
 * @returns Resolved options.
 * @throws {@link MetaError} `invalid_options` on a bad base URL (not http(s), or carrying a query string or fragment), a non-positive timeout or no `fetch`.
 */
export function resolveClientOptions(
  options: MetaClientOptions,
): ResolvedClientOptions {
  const { baseUrl } = options;
  if (!URL.canParse(baseUrl) || !/^https?:$/.test(new URL(baseUrl).protocol)) {
    throw invalid(`baseUrl must be an http(s) URL, got "${baseUrl}"`);
  }
  // Entry paths are appended to baseUrl, so a query or fragment would
  // swallow them. Check the raw string: URL drops an empty `?` or `#`.
  if (/[?#]/.test(baseUrl)) {
    throw invalid(
      `baseUrl must not contain a query string or fragment, got "${baseUrl}"`,
    );
  }
  const fetchImpl =
    options.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  if (fetchImpl === undefined) {
    throw invalid('No fetch implementation available; pass options.fetch');
  }
  const errorTexts = new WeakMap<Headers, string>();
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeoutMs: checkTimeout(
      'timeoutMs',
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    ),
    fetch: captureErrorText(fetchImpl, errorTexts),
    errorTexts,
  };
}
