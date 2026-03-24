/**
 * Tests for post-registration virtual rule verification.
 *
 * @module rules/verify.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import { verifyRuleApplication } from './verify.js';

function createMockWatcher(walkResult: string[]): WatcherClient {
  return {
    walk: vi.fn().mockResolvedValue(walkResult),
    registerRules: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockLogger(): MinimalLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('verifyRuleApplication', () => {
  it('logs info with count when metas are found', async () => {
    const watcher = createMockWatcher([
      'j:/domains/projects/foo/.meta/meta.json',
      'j:/domains/projects/bar/.meta/meta.json',
    ]);
    const logger = createMockLogger();

    const count = await verifyRuleApplication(watcher, logger);

    expect(count).toBe(2);
    expect(logger.info).toHaveBeenCalledWith(
      { count: 2 },
      'Post-registration verification: metas discoverable',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs warning when no metas are found', async () => {
    const watcher = createMockWatcher([]);
    const logger = createMockLogger();

    const count = await verifyRuleApplication(watcher, logger);

    expect(count).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      { count: 0 },
      expect.stringContaining('no .meta/meta.json files found'),
    );
  });

  it('logs warning and returns 0 when watcher is unreachable', async () => {
    const watcher: WatcherClient = {
      walk: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      registerRules: vi.fn().mockResolvedValue(undefined),
    };
    const logger = createMockLogger();

    const count = await verifyRuleApplication(watcher, logger);

    expect(count).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: 'ECONNREFUSED' },
      'Post-registration verification failed (watcher may be unavailable)',
    );
  });

  it('deduplicates meta paths from walk results', async () => {
    // Walk may return multiple chunks for the same file
    const watcher = createMockWatcher([
      'j:/domains/foo/.meta/meta.json',
      'j:/domains/foo/.meta/meta.json',
      'j:/domains/bar/.meta/meta.json',
    ]);
    const logger = createMockLogger();

    const count = await verifyRuleApplication(watcher, logger);

    // discoverMetas deduplicates by .meta/ directory
    expect(count).toBe(2);
  });
});
