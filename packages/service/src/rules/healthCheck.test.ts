/**
 * Tests for WatcherHealthCheck periodic loop.
 *
 * @module rules/healthCheck.test
 */

import pino from 'pino';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { MetaConfig } from '../schema/index.js';
import { WatcherHealthCheck } from './healthCheck.js';
import { RuleRegistrar } from './index.js';

const mockFetch = vi.fn();

const logger = pino({ level: 'silent' });

const config = {
  metaProperty: { domains: ['meta'] },
  metaArchiveProperty: { domains: ['meta-archive'] },
} as unknown as MetaConfig;

function makeWatcher(): WatcherClient {
  return {
    registerRules: vi.fn().mockResolvedValue(undefined),
    walk: vi.fn().mockResolvedValue([]),
  };
}

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WatcherHealthCheck', () => {
  it('does not start when intervalMs is 0', () => {
    const watcher = makeWatcher();
    const registrar = new RuleRegistrar(config, logger, watcher);
    const hc = new WatcherHealthCheck({
      watcherUrl: 'http://localhost:1936',
      intervalMs: 0,
      registrar,
      logger,
    });

    hc.start();
    // No interval set — fetch should never be called
    vi.advanceTimersByTime(120_000);
    expect(mockFetch).not.toHaveBeenCalled();
    hc.stop();
  });

  it('pings watcher /status on interval', async () => {
    const watcher = makeWatcher();
    const registrar = new RuleRegistrar(config, logger, watcher);

    // Pre-register so registrar has initial state
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await registrar.register();
    mockFetch.mockReset();

    const hc = new WatcherHealthCheck({
      watcherUrl: 'http://localhost:1936',
      intervalMs: 60_000,
      registrar,
      logger,
    });

    mockFetch.mockResolvedValue(jsonResponse({ status: 'ok', uptime: 100 }));
    hc.start();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:1936/status',
      expect.objectContaining({ signal: expect.anything() as AbortSignal }),
    );

    hc.stop();
  });

  it('re-registers rules when watcher uptime decreases', async () => {
    const watcher = makeWatcher();
    const registrar = new RuleRegistrar(config, logger, watcher);

    // Initial registration
    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await registrar.register();
    expect(registrar.isRegistered).toBe(true);
    mockFetch.mockReset();

    const hc = new WatcherHealthCheck({
      watcherUrl: 'http://localhost:1936',
      intervalMs: 10_000,
      registrar,
      logger,
    });

    // First check: uptime 100
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ status: 'ok', uptime: 100 }),
    );
    hc.start();
    await vi.advanceTimersByTimeAsync(10_000);

    // Second check: uptime 5 (restart detected)
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ status: 'ok', uptime: 5 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true })); // re-registration
    await vi.advanceTimersByTimeAsync(10_000);

    // registerRules should have been called again
    expect(
      (watcher.registerRules as Mock).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);

    hc.stop();
  });

  it('handles watcher unreachable gracefully', async () => {
    const watcher = makeWatcher();
    const registrar = new RuleRegistrar(config, logger, watcher);

    mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await registrar.register();
    mockFetch.mockReset();

    const hc = new WatcherHealthCheck({
      watcherUrl: 'http://localhost:1936',
      intervalMs: 10_000,
      registrar,
      logger,
    });

    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    hc.start();
    await vi.advanceTimersByTimeAsync(10_000);

    // Should not throw, registrar state unchanged
    expect(registrar.isRegistered).toBe(true);
    hc.stop();
  });
});
