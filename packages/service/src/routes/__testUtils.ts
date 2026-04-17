/**
 * Shared test utilities for route test files.
 *
 * Provides factories for RouteDeps, logger mocks, watcher mocks, and
 * filesystem-based meta fixtures. Eliminates duplication across 9+ test files.
 *
 * @module routes/__testUtils
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Logger } from 'pino';
import { vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { SynthesisQueue } from '../queue/index.js';
import type { RouteDeps, ServiceStats } from './index.js';

/** Default service config for tests. */
const DEFAULT_TEST_CONFIG: RouteDeps['config'] = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:18789',
  depthWeight: 0.5,
  architectEvery: 10,
  maxArchive: 20,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  thinking: 'low',
  defaultArchitect: 'arch',
  defaultCritic: 'crit',
  skipUnchanged: true,
  metaProperty: {},
  metaArchiveProperty: {},
  port: 1938,
  schedule: '*/30 * * * *',
  watcherHealthIntervalMs: 60000,
  logging: { level: 'info' },
  autoSeed: [],
};

/** Default service stats for tests. */
const DEFAULT_TEST_STATS: ServiceStats = {
  totalSyntheses: 0,
  totalTokens: 0,
  totalErrors: 0,
  lastCycleDurationMs: null,
  lastCycleAt: null,
};

/** Create a mock pino logger with all standard methods. */
export function makeTestLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: 'info',
  } as unknown as Logger;
}

/** Overrides for makeTestDeps — config can be partially specified. */
type TestDepsOverrides = Omit<Partial<RouteDeps>, 'config'> & {
  config?: Partial<RouteDeps['config']>;
};

/** Create a RouteDeps object with sensible test defaults. */
export function makeTestDeps(overrides: TestDepsOverrides = {}): RouteDeps {
  const { config: configOverrides, ...rest } = overrides;
  return {
    config: {
      ...DEFAULT_TEST_CONFIG,
      ...configOverrides,
    } as RouteDeps['config'],
    logger: rest.logger ?? makeTestLogger(),
    queue: rest.queue ?? new SynthesisQueue(makeTestLogger()),
    watcher: rest.watcher ?? ({} as RouteDeps['watcher']),
    scheduler: rest.scheduler ?? null,
    stats: rest.stats ?? { ...DEFAULT_TEST_STATS },
    ...rest,
  };
}

/**
 * Create a mock WatcherClient that resolves walk() with given paths.
 *
 * @param metaJsonPaths - Paths to return from walk().
 * @param scan - Optional custom scan mock (defaults to empty results).
 */
export function makeTestWatcher(
  metaJsonPaths: string[] = [],
  scan = vi.fn().mockResolvedValue({ points: [], cursor: null }),
): WatcherClient {
  return {
    walk: vi.fn().mockResolvedValue(metaJsonPaths),
    registerRules: vi.fn().mockResolvedValue(undefined),
    scan,
  };
}

/** Create a mock WatcherClient that rejects walk() calls. */
export function makeFailingTestWatcher(): WatcherClient {
  return {
    walk: vi.fn().mockRejectedValue(new Error('connection refused')),
    registerRules: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a .meta/meta.json on disk and return the meta.json path.
 *
 * @param ownerDir - The owner directory to create .meta/ in.
 * @param meta - Additional meta fields (merged with default _id).
 * @returns The path to the created meta.json file.
 */
export function createTestMeta(
  ownerDir: string,
  meta: Record<string, unknown> = {},
): string {
  const metaDir = join(ownerDir, '.meta');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(
    join(metaDir, 'meta.json'),
    JSON.stringify({
      _id: '550e8400-e29b-41d4-a716-446655440099',
      ...meta,
    }),
  );
  return join(metaDir, 'meta.json');
}
