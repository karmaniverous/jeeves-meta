/**
 * Unit tests for MetaCache.
 *
 * Covers: TTL freshness, concurrent refresh coalescing, invalidation,
 * and error propagation from listMetas.
 *
 * @module cache.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the discovery module so listMetas is controllable
vi.mock('./discovery/index.js', () => ({
  listMetas: vi.fn(),
}));

import { MetaCache } from './cache.js';
import { listMetas } from './discovery/index.js';
import type { WatcherClient } from './interfaces/index.js';
import type { ServiceConfig } from './schema/config.js';

const mockListMetas = vi.mocked(listMetas);

function makeConfig(): ServiceConfig {
  return {
    watcherUrl: 'http://localhost:3456',
    gatewayUrl: 'http://127.0.0.1:18789',
    architectEvery: 10,
    depthWeight: 0.5,
    maxArchive: 20,
    maxLines: 500,
    thinking: 'low',
    defaultArchitect: 'a',
    defaultCritic: 'c',
    skipUnchanged: true,
    metaProperty: {},
    metaArchiveProperty: {},
    port: 1938,
    schedule: '* * * * *',
    watcherHealthIntervalMs: 60000,
    tier2ScanLimit: 50,
    logging: { level: 'info' },
    autoSeed: [],
  };
}

function makeWatcher(): WatcherClient {
  return { walk: vi.fn(), registerRules: vi.fn() };
}

function fakeResult(tag: string) {
  return { entries: [], tree: { metaPath: tag } } as unknown as Awaited<
    ReturnType<typeof listMetas>
  >;
}

describe('MetaCache', () => {
  let cache: MetaCache;
  let config: ServiceConfig;
  let watcher: WatcherClient;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new MetaCache();
    config = makeConfig();
    watcher = makeWatcher();
    mockListMetas.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls listMetas on first get() and caches the result', async () => {
    const result = fakeResult('first');
    mockListMetas.mockResolvedValue(result);

    const got = await cache.get(config, watcher);
    expect(got).toBe(result);
    expect(mockListMetas).toHaveBeenCalledTimes(1);

    // Second call within TTL returns cached
    const got2 = await cache.get(config, watcher);
    expect(got2).toBe(result);
    expect(mockListMetas).toHaveBeenCalledTimes(1);
  });

  it('refreshes after TTL expires', async () => {
    const r1 = fakeResult('r1');
    const r2 = fakeResult('r2');
    mockListMetas.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    await cache.get(config, watcher);
    expect(mockListMetas).toHaveBeenCalledTimes(1);

    // Advance past TTL (60s)
    vi.advanceTimersByTime(61_000);

    const got = await cache.get(config, watcher);
    expect(got).toBe(r2);
    expect(mockListMetas).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent refresh calls', async () => {
    let resolveListMetas!: (v: Awaited<ReturnType<typeof listMetas>>) => void;
    mockListMetas.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListMetas = resolve;
        }),
    );

    const p1 = cache.get(config, watcher);
    const p2 = cache.get(config, watcher);

    // Only one listMetas call despite two concurrent gets
    expect(mockListMetas).toHaveBeenCalledTimes(1);

    const result = fakeResult('coalesced');
    resolveListMetas(result);

    const [got1, got2] = await Promise.all([p1, p2]);
    expect(got1).toBe(result);
    expect(got2).toBe(result);
  });

  it('invalidate() forces refresh on next get()', async () => {
    const r1 = fakeResult('r1');
    const r2 = fakeResult('r2');
    mockListMetas.mockResolvedValueOnce(r1).mockResolvedValueOnce(r2);

    await cache.get(config, watcher);
    cache.invalidate();

    const got = await cache.get(config, watcher);
    expect(got).toBe(r2);
    expect(mockListMetas).toHaveBeenCalledTimes(2);
  });

  it('propagates errors from listMetas', async () => {
    mockListMetas.mockRejectedValue(new Error('watcher down'));

    await expect(cache.get(config, watcher)).rejects.toThrow('watcher down');
  });

  it('retries after a failed refresh', async () => {
    mockListMetas
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(fakeResult('ok'));

    await expect(cache.get(config, watcher)).rejects.toThrow('fail');

    // Next call should retry since no result was stored
    const got = await cache.get(config, watcher);
    expect((got.tree as unknown as { metaPath: string }).metaPath).toBe('ok');
  });
});
