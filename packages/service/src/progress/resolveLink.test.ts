/**
 * Tests for resolve-path link resolution and machine-key derivation.
 *
 * @module progress/resolveLink.test
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deriveServerUrlKey, resolveLink } from './resolveLink.js';

const SERVER = 'http://127.0.0.1:1934';
const FS_PATH = 'j:/domains/github/org';

/** Mock fetch with a fixed response and capture the requested URLs. */
function mockFetch(response: () => Promise<Response>): string[] {
  const urls: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    urls.push(input instanceof Request ? input.url : String(input));
    return response();
  });
  return urls;
}

const okJson = (body: unknown) => () =>
  Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );

describe('deriveServerUrlKey', () => {
  it('matches jeeves-server-core computeInsiderKey', () => {
    // Vector produced by @karmaniverous/jeeves-server-core@0.3.0
    // computeInsiderKey('test-seed').
    expect(deriveServerUrlKey('test-seed')).toBe(
      '21efb54b51cb607b79cd48a386d4ed7b',
    );
  });
});

describe('resolveLink', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the derived key as k and returns the public URL', async () => {
    const urls = mockFetch(
      okJson({
        browseUrl: '/browse/j/domains/github/org',
        publicUrl: 'https://jeeves.example.com/browse/j/domains/github/org',
      }),
    );

    const result = await resolveLink(FS_PATH, SERVER, 'test-seed');

    expect(result).toEqual({
      kind: 'resolved',
      link: 'https://jeeves.example.com/browse/j/domains/github/org',
    });
    const url = new URL(urls[0] ?? '');
    expect(url.pathname).toBe('/api/resolve-path');
    expect(url.searchParams.get('fsPath')).toBe(FS_PATH);
    expect(url.searchParams.get('k')).toBe('21efb54b51cb607b79cd48a386d4ed7b');
    expect(url.searchParams.has('key')).toBe(false);
    // The seed itself never goes on the wire.
    expect(urls[0]).not.toContain('test-seed');
  });

  it('sends no key parameter when serverKey is unset', async () => {
    const urls = mockFetch(okJson({ browseUrl: '/browse/j/x' }));

    const result = await resolveLink(FS_PATH, SERVER);

    expect(result).toEqual({
      kind: 'resolved',
      link: 'http://127.0.0.1:1934/browse/j/x',
    });
    expect(new URL(urls[0] ?? '').searchParams.has('k')).toBe(false);
  });

  it.each([401, 403])('reports %i as unauthorized', async (status) => {
    mockFetch(() => Promise.resolve(new Response('no', { status })));

    expect(await resolveLink(FS_PATH, SERVER, 'bad')).toEqual({
      kind: 'unauthorized',
      status,
    });
  });

  it('falls back to the raw path on a non-auth HTTP error', async () => {
    mockFetch(() => Promise.resolve(new Response('nf', { status: 404 })));

    expect(await resolveLink(FS_PATH, SERVER, 'test-seed')).toEqual({
      kind: 'fallback',
      link: FS_PATH,
    });
  });

  it.each([
    ['a non-string publicUrl', { publicUrl: 42 }],
    ['a non-string browseUrl', { browseUrl: ['x'] }],
    ['a non-object body', 'oops'],
  ])('falls back to the raw path on %s', async (_label, body) => {
    mockFetch(okJson(body));

    expect(await resolveLink(FS_PATH, SERVER, 'test-seed')).toEqual({
      kind: 'fallback',
      link: FS_PATH,
    });
  });

  it('falls back to the raw path on a non-JSON 200 body', async () => {
    mockFetch(() => Promise.resolve(new Response('<html>', { status: 200 })));

    expect(await resolveLink(FS_PATH, SERVER, 'test-seed')).toEqual({
      kind: 'fallback',
      link: FS_PATH,
    });
  });

  it('falls back to the raw path on a network error', async () => {
    mockFetch(() => Promise.reject(new Error('connection refused')));

    expect(await resolveLink(FS_PATH, SERVER, 'test-seed')).toEqual({
      kind: 'fallback',
      link: FS_PATH,
    });
  });
});
