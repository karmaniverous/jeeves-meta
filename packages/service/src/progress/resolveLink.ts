/**
 * Resolve filesystem paths to jeeves-server browse links via
 * `GET /api/resolve-path`, authenticated with a jeeves-server machine key.
 * Network I/O only; no logging (callers decide how to report auth failures).
 *
 * @module progress/resolveLink
 */

import { createHmac } from 'node:crypto';

import { fetchWithTimeout } from '@karmaniverous/jeeves';
import { z } from 'zod';

/** Timeout for resolve-path API calls (ms). */
const RESOLVE_PATH_TIMEOUT_MS = 3000;

/** The fields of a resolve-path 200 response this module uses. */
const resolvePathResponseSchema = z.object({
  browseUrl: z.string().optional(),
  publicUrl: z.string().optional(),
});

/**
 * Outcome of a resolve-path lookup.
 *
 * - `resolved`: `link` is a browse URL.
 * - `fallback`: `link` is the raw filesystem path (network error, non-auth
 *   HTTP error, or a response without a URL).
 * - `unauthorized`: the server refused the request (401/403); there is no
 *   usable link, and the raw path must not be emitted in its place.
 */
export type ResolveLinkResult =
  | { kind: 'resolved'; link: string }
  | { kind: 'fallback'; link: string }
  | { kind: 'unauthorized'; status: number };

/**
 * Derive the URL key jeeves-server accepts for a machine key seed.
 *
 * Mirrors `computeInsiderKey` in `@karmaniverous/jeeves-server-core`:
 * the first 32 hex chars of HMAC-SHA256(seed, 'insider'). Kept local so this
 * service does not pull in a second copy of `@karmaniverous/jeeves`.
 *
 * @param seed - Machine key seed, as configured under `keys` in jeeves-server.
 * @returns The derived URL key.
 */
export function deriveServerUrlKey(seed: string): string {
  return createHmac('sha256', seed)
    .update('insider')
    .digest('hex')
    .substring(0, 32);
}

/**
 * Resolve a filesystem path to a browse URL.
 *
 * Sends the derived machine key as the `k` query parameter when `serverKey`
 * is set. On HTTP 200 uses `publicUrl` if present, otherwise prefixes
 * `serverUrl` to `browseUrl`. A malformed 200 response falls back.
 *
 * @param fsPath - Absolute filesystem path to resolve.
 * @param serverUrl - jeeves-server base URL.
 * @param serverKey - Optional jeeves-server machine key seed.
 * @returns The lookup outcome.
 */
export async function resolveLink(
  fsPath: string,
  serverUrl: string,
  serverKey?: string,
): Promise<ResolveLinkResult> {
  const fallback: ResolveLinkResult = { kind: 'fallback', link: fsPath };
  try {
    const url = new URL('/api/resolve-path', serverUrl);
    url.searchParams.set('fsPath', fsPath);
    if (serverKey) url.searchParams.set('k', deriveServerUrlKey(serverKey));
    const res = await fetchWithTimeout(url.toString(), RESOLVE_PATH_TIMEOUT_MS);
    if (res.status === 401 || res.status === 403)
      return { kind: 'unauthorized', status: res.status };
    if (!res.ok) return fallback;
    const parsed = resolvePathResponseSchema.safeParse(await res.json());
    if (!parsed.success) return fallback;
    const data = parsed.data;
    if (data.publicUrl) return { kind: 'resolved', link: data.publicUrl };
    if (data.browseUrl)
      return {
        kind: 'resolved',
        link: serverUrl.replace(/\/+$/, '') + data.browseUrl,
      };
    return fallback;
  } catch {
    return fallback;
  }
}
