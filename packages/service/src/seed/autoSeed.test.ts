/**
 * Tests for auto-seed pass.
 *
 * @module seed/autoSeed.test
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import type { AutoSeedRule } from '../schema/config.js';
import { autoSeedPass } from './autoSeed.js';
import { createMeta } from './createMeta.js';

let testRoot: string;

function createMockWatcher(
  walkResults: Record<string, string[]>,
): WatcherClient {
  return {
    walk: vi.fn().mockImplementation(async (globs: string[]) => {
      return Promise.resolve(walkResults[globs[0]] ?? []);
    }),
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

beforeEach(() => {
  testRoot = join(
    tmpdir(),
    `jeeves-autoseed-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testRoot, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('autoSeedPass', () => {
  it('seeds matching directories that lack .meta/', async () => {
    const dirA = join(testRoot, 'a');
    const dirB = join(testRoot, 'b');
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    // Watcher returns forward-slash normalized paths
    const rootFwd = testRoot.replace(/\\/g, '/');
    const watcher = createMockWatcher({
      [`${testRoot}/*/**`]: [`${rootFwd}/a/file1.md`, `${rootFwd}/b/file2.md`],
    });

    const rules: AutoSeedRule[] = [{ match: `${testRoot}/*/**` }];
    const logger = createMockLogger();
    const result = await autoSeedPass(rules, watcher, logger);

    expect(result.seeded).toBe(2);
    expect(existsSync(join(dirA, '.meta', 'meta.json'))).toBe(true);
    expect(existsSync(join(dirB, '.meta', 'meta.json'))).toBe(true);
  });

  it('skips directories that already have .meta/', async () => {
    const dirA = join(testRoot, 'a');
    const dirB = join(testRoot, 'b');
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    // Pre-seed dirA
    await createMeta(dirA);

    const rootFwd = testRoot.replace(/\\/g, '/');
    const watcher = createMockWatcher({
      [`${testRoot}/*/**`]: [`${rootFwd}/a/file1.md`, `${rootFwd}/b/file2.md`],
    });

    const rules: AutoSeedRule[] = [{ match: `${testRoot}/*/**` }];
    const result = await autoSeedPass(rules, watcher);

    expect(result.seeded).toBe(1);
    // Paths from watcher are forward-slash normalized
    expect(result.paths).toEqual([`${rootFwd}/b`]);
  });

  it('later rules override steer/crossRefs (last match wins)', async () => {
    const dirA = join(testRoot, 'a');
    mkdirSync(dirA, { recursive: true });

    const rootFwd = testRoot.replace(/\\/g, '/');
    const watcher = createMockWatcher({
      [`${testRoot}/**/*`]: [`${rootFwd}/a/file.md`],
      [`${testRoot}/a/**`]: [`${rootFwd}/a/file.md`],
    });

    const rules: AutoSeedRule[] = [
      {
        match: `${testRoot}/**/*`,
        steer: 'General steer',
        crossRefs: ['j:/ref1'],
      },
      {
        match: `${testRoot}/a/**`,
        steer: 'Specific steer',
        crossRefs: ['j:/ref2'],
      },
    ];

    const result = await autoSeedPass(rules, watcher);
    expect(result.seeded).toBe(1);

    const meta = JSON.parse(
      readFileSync(join(dirA, '.meta', 'meta.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(meta._steer).toBe('Specific steer');
    expect(meta._crossRefs).toEqual(['j:/ref2']);
  });

  it('returns empty result when autoSeed is empty', async () => {
    const walkSpy = vi.fn().mockResolvedValue([]);
    const watcher: WatcherClient = {
      walk: walkSpy,
      registerRules: vi.fn().mockResolvedValue(undefined),
    };
    const result = await autoSeedPass([], watcher);
    expect(result.seeded).toBe(0);
    expect(result.paths).toEqual([]);
    expect(walkSpy).not.toHaveBeenCalled();
  });

  it('logs info for each seeded path', async () => {
    const dirA = join(testRoot, 'a');
    mkdirSync(dirA, { recursive: true });

    const rootFwd = testRoot.replace(/\\/g, '/');
    const watcher = createMockWatcher({
      [`${testRoot}/*/**`]: [`${rootFwd}/a/file.md`],
    });

    const logger = createMockLogger();
    await autoSeedPass([{ match: `${testRoot}/*/**` }], watcher, logger);

    expect(logger.info).toHaveBeenCalledWith(
      { path: `${rootFwd}/a` },
      'auto-seeded meta',
    );
  });
});
