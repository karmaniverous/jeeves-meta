/**
 * Resolve filesystem paths to jeeves-server browse links via
 * `GET /api/resolve-path`, authenticated with a jeeves-server machine key.
 * Network I/O only; no logging (callers decide how to report auth failures).
 *
 * @module progress/resolveLink
 */

import { computeInsiderKey, fetchWithTimeout } from '@karmaniverous/jeeves';
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
 * Resolve a filesystem path to a browse URL.
 *
 * Sends the derived machine key (jeeves `computeInsiderKey`) as the `k`
 * query parameter when `serverKey`
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
    if (serverKey) url.searchParams.set('k', computeInsiderKey(serverKey));
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
