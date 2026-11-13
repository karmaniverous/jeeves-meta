/**
 * Tests for the SDK-backed watcher client: requests sent, meta's retry
 * policy (transient HTTP statuses only), response mapping, and the
 * `/status` probe, including the indexing flag (#244).
 *
 * @module watcher-client/SdkWatcherClient.test
 */

import { describe, expect, it, vi } from 'vitest';

import { probeWatcher, SdkWatcherClient } from './SdkWatcherClient.js';

const BASE = 'http://localhost:1936';

/** A JSON response with the given status. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A standard error body for a non-2xx status. */
function errorBody(status: number): Response {
  return json({ statusCode: status, error: 'Error', message: 'boom' }, status);
}

/** A valid watcher `GET /status` reply. */
function status(uptime: number, health: Record<string, unknown> = {}) {
  return json({
    name: 'watcher',
    version: '0.0.0',
    uptime,
    status: 'healthy',
    health,
  });
}

/** A client with instant backoff over the given fetch mock. */
function client(fetchImpl: ReturnType<typeof vi.fn>, maxRetries = 3) {
  return new SdkWatcherClient({
    baseUrl: BASE,
    maxRetries,
    backoffBaseMs: 1,
    backoffFactor: 1,
    fetch: fetchImpl as never,
  });
}

/** The URL, method and JSON body of fetch call `i`. */
function call(fetchImpl: ReturnType<typeof vi.fn>, i = 0) {
  const [url, init] = fetchImpl.mock.calls[i] as [string, RequestInit];
  return {
    url,
    method: init.method,
    body: JSON.parse(init.body as string) as unknown,
  };
}

describe('SdkWatcherClient requests', () => {
  it('registerRules posts source and rules to /rules/register', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        json({ source: 'jeeves-meta', registered: 1, totalVirtualRules: 1 }),
      );
    const rule = {
      name: 'meta-current',
      description: 'd',
      match: {},
      schema: [],
    };
    await client(fetchImpl).registerRules('jeeves-meta', [rule]);
    expect(call(fetchImpl)).toEqual({
      url: `${BASE}/rules/register`,
      method: 'POST',
      body: { source: 'jeeves-meta', rules: [rule] },
    });
  });

  it('walk posts globs and returns paths', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        paths: ['j:/a/.meta/meta.json'],
        matchedCount: 1,
        scannedRoots: ['j:/a'],
      }),
    );
    const paths = await client(fetchImpl).walk(['**/.meta/meta.json']);
    expect(paths).toEqual(['j:/a/.meta/meta.json']);
    expect(call(fetchImpl)).toMatchObject({
      url: `${BASE}/walk`,
      body: { globs: ['**/.meta/meta.json'] },
    });
  });

  it('scan maps points and a string cursor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json({
        points: [{ id: 'p1', payload: { file_path: 'x' } }],
        cursor: 'c2',
      }),
    );
    const filter = {
      must: [{ key: 'domains', match: { value: 'meta-archive' } }],
    };
    const res = await client(fetchImpl).scan({ filter, limit: 5 });
    expect(res).toEqual({
      points: [{ id: 'p1', payload: { file_path: 'x' } }],
      cursor: 'c2',
    });
    expect(call(fetchImpl)).toMatchObject({
      url: `${BASE}/scan`,
      body: { filter, limit: 5 },
    });
  });

  it('scan answers no points for a count reply and a null cursor', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ count: 3 }));
    const res = await client(fetchImpl).scan({
      filter: { must: [] },
      countOnly: true,
    });
    expect(res).toEqual({ points: [], cursor: null });
  });
});

describe('SdkWatcherClient retry policy', () => {
  it.each([500, 503, 408, 429])('retries HTTP %i', async (code) => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(errorBody(code))
      .mockResolvedValueOnce(
        json({ paths: ['a'], matchedCount: 1, scannedRoots: [] }),
      );
    expect(await client(fetchImpl).walk(['*'])).toEqual(['a']);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry HTTP 400 and names the endpoint and status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorBody(400));
    await expect(client(fetchImpl).walk(['*'])).rejects.toThrow(
      /^Watcher \/walk failed: HTTP 400 - /,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries retries', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(() => Promise.resolve(errorBody(500)));
    await expect(client(fetchImpl, 2).walk(['*'])).rejects.toThrow('HTTP 500');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not retry a network error', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(client(fetchImpl).walk(['*'])).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('probeWatcher', () => {
  it('reports ok with the uptime', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(42));
    expect(await probeWatcher(BASE, 1000, fetchImpl as never)).toEqual({
      status: 'ok',
      uptime: 42,
      indexing: false,
    });
    expect((fetchImpl.mock.calls[0] as [string])[0]).toBe(`${BASE}/status`);
  });

  it('reports indexing while the initial scan runs (#244)', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        status(7, { initialScan: { active: true, filesMatched: 10 } }),
      );
    expect(await probeWatcher(BASE, 1000, fetchImpl as never)).toEqual({
      status: 'indexing',
      uptime: 7,
      indexing: true,
    });
  });

  it('reports ok once the initial scan has finished', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(status(7, { initialScan: { active: false } }));
    expect((await probeWatcher(BASE, 1000, fetchImpl as never)).status).toBe(
      'ok',
    );
  });

  it('reports error for a non-2xx reply', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errorBody(500));
    expect(await probeWatcher(BASE, 1000, fetchImpl as never)).toEqual({
      status: 'error',
      indexing: false,
    });
  });

  it('reports unreachable when nothing answers', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    expect(await probeWatcher(BASE, 1000, fetchImpl as never)).toEqual({
      status: 'unreachable',
      indexing: false,
    });
  });
});
