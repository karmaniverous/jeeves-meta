/**
 * @module options.test
 * Client options: base URL and timeout validation, the default (120 s, jeeves' own default), and the fetch adapter that keeps non-2xx bodies as received.
 */

import { DEFAULT_FETCH_TIMEOUT_MS } from '@karmaniverous/jeeves';
import { describe, expect, it, vi } from 'vitest';

import {
  captureErrorText,
  checkTimeout,
  DEFAULT_TIMEOUT_MS,
  resolveClientOptions,
} from './options.js';

const stubFetch = () => vi.fn(() => Promise.resolve(new Response('{}')));

describe('defaults', () => {
  it("is jeeves' default fetch timeout (120 s)", () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(DEFAULT_TIMEOUT_MS).toBe(120_000);
  });

  it('applies it when no timeout is given', () => {
    const resolved = resolveClientOptions({
      baseUrl: 'http://x',
      fetch: stubFetch(),
    });
    expect(resolved.timeoutMs).toBe(120_000);
  });
});

describe('resolveClientOptions', () => {
  it('strips trailing slashes and keeps a path prefix', () => {
    const { baseUrl } = resolveClientOptions({
      baseUrl: 'http://127.0.0.1:1938/meta//',
      fetch: stubFetch(),
    });
    expect(baseUrl).toBe('http://127.0.0.1:1938/meta');
  });

  it.each([
    ['not a URL', 'nope'],
    ['a non-http scheme', 'ftp://host'],
    ['a query string', 'http://host?x=1'],
    ['an empty query', 'http://host/?'],
    ['a fragment', 'http://host#top'],
  ])('rejects %s', (_label, baseUrl) => {
    expect(() => resolveClientOptions({ baseUrl, fetch: stubFetch() })).toThrow(
      expect.objectContaining({ code: 'invalid_options', status: 0 }),
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects a timeout of %s',
    (value) => {
      expect(() =>
        resolveClientOptions({
          baseUrl: 'http://x',
          timeoutMs: value,
          fetch: stubFetch(),
        }),
      ).toThrow(/timeoutMs must be a positive number/);
    },
  );

  it('rejects a missing fetch', () => {
    vi.stubGlobal('fetch', undefined);
    try {
      expect(() => resolveClientOptions({ baseUrl: 'http://x' })).toThrow(
        /No fetch implementation/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('checkTimeout', () => {
  it('returns a positive timeout', () => {
    expect(checkTimeout('timeoutMs', 5)).toBe(5);
  });
});

describe('captureErrorText', () => {
  it('passes 2xx responses through untouched', async () => {
    const res = new Response('{"ok":true}');
    const texts = new WeakMap<Headers, string>();
    const adapted = captureErrorText(() => Promise.resolve(res), texts);
    expect(await adapted('http://x/status', {})).toBe(res);
  });

  it('keeps a non-2xx body by the returned headers, and still serves it', async () => {
    const texts = new WeakMap<Headers, string>();
    const adapted = captureErrorText(
      () =>
        Promise.resolve(
          new Response('not json', {
            status: 502,
            statusText: 'Bad Gateway',
            headers: { 'x-a': '1' },
          }),
        ),
      texts,
    );
    const res = await adapted(new URL('http://x/metas'), {});
    expect(res.status).toBe(502);
    expect(res.statusText).toBe('Bad Gateway');
    expect(res.headers.get('x-a')).toBe('1');
    expect(texts.get(res.headers)).toBe('not json');
    expect(await res.text()).toBe('not json');
  });

  it('records an empty body for a bodiless non-2xx status', async () => {
    const texts = new WeakMap<Headers, string>();
    const res304 = new Response(null, { status: 304 });
    const res = await captureErrorText(() => Promise.resolve(res304), texts)(
      'http://x',
      {},
    );
    expect(res).toBe(res304);
    expect(texts.get(res.headers)).toBe('');
  });

  it('passes the URL of a Request through', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response('{}')));
    await captureErrorText(
      fetchImpl,
      new WeakMap(),
    )(new Request('http://x/metas/a'));
    expect(fetchImpl).toHaveBeenCalledWith('http://x/metas/a', {});
  });
});
