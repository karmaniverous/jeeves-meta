/**
 * Tests for watcher-based meta discovery via watcher /walk.
 *
 * @module discovery/discoverMetas.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { discoverMetas } from './discoverMetas.js';

function mockWatcher(filePaths: string[]) {
  const walkFn = vi.fn().mockResolvedValue(filePaths);
  const watcher: WatcherClient = {
    registerRules: vi.fn().mockResolvedValue(undefined),
    walk: walkFn,
  };

  return { watcher, walk: walkFn };
}

describe('discoverMetas', () => {
  it('calls watcher.walk with the meta.json glob', async () => {
    const { watcher, walk } = mockWatcher([]);
    await discoverMetas(watcher);
    expect(walk).toHaveBeenCalledWith(['**/.meta/meta.json']);
  });

  it('returns normalized meta paths derived from meta.json paths', async () => {
    const { watcher } = mockWatcher([
      'j:/domains/email/.meta/meta.json',
      'j:/domains/github/.meta/meta.json',
    ]);

    const result = await discoverMetas(watcher);
    expect(result).toEqual([
      'j:/domains/email/.meta',
      'j:/domains/github/.meta',
    ]);
  });

  it('deduplicates duplicate meta.json paths', async () => {
    const { watcher } = mockWatcher([
      'j:/domains/email/.meta/meta.json',
      'j:/domains/email/.meta/meta.json',
    ]);

    const result = await discoverMetas(watcher);
    expect(result).toEqual(['j:/domains/email/.meta']);
  });

  it('normalizes backslash paths from watcher', async () => {
    const { watcher } = mockWatcher(['j:\\domains\\email\\.meta\\meta.json']);
    const result = await discoverMetas(watcher);
    expect(result[0]).toBe('j:/domains/email/.meta');
  });
});
