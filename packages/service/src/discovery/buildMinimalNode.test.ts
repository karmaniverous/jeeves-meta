/**
 * Tests for buildMinimalNode — targeted meta node construction via watcher walk.
 *
 * @module discovery/buildMinimalNode.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { buildMinimalNode } from './buildMinimalNode.js';

function mockWatcher(paths: string[]) {
  const walkFn = vi.fn().mockResolvedValue(paths);
  const watcher: WatcherClient = {
    registerRules: vi.fn().mockResolvedValue(undefined),
    walk: walkFn,
  };
  return { watcher, walk: walkFn };
}

describe('buildMinimalNode', () => {
  it('returns a node with no children when walk returns only self', async () => {
    const { watcher } = mockWatcher(['j:/domains/email/.meta/meta.json']);
    const node = await buildMinimalNode('j:/domains/email/.meta', watcher);

    expect(node.metaPath).toBe('j:/domains/email/.meta');
    expect(node.ownerPath).toBe('j:/domains/email');
    expect(node.children).toHaveLength(0);
    expect(node.treeDepth).toBe(0);
  });

  it('returns a node with no children when walk returns empty', async () => {
    const { watcher } = mockWatcher([]);
    const node = await buildMinimalNode('j:/domains/email/.meta', watcher);

    expect(node.children).toHaveLength(0);
  });

  it('discovers direct child metas', async () => {
    const { watcher } = mockWatcher([
      'j:/domains/github/.meta/meta.json',
      'j:/domains/github/karmaniverous/.meta/meta.json',
      'j:/domains/github/other-org/.meta/meta.json',
    ]);

    const node = await buildMinimalNode('j:/domains/github/.meta', watcher);

    expect(node.children).toHaveLength(2);
    const childOwners = node.children.map((c) => c.ownerPath).sort();
    expect(childOwners).toEqual([
      'j:/domains/github/karmaniverous',
      'j:/domains/github/other-org',
    ]);
  });

  it('excludes nested descendants (only direct children)', async () => {
    // github/.meta owns github/
    // github/karmaniverous/.meta owns github/karmaniverous/
    // github/karmaniverous/jeeves-meta/.meta is nested under karmaniverous — NOT a direct child of github
    const { watcher } = mockWatcher([
      'j:/domains/github/.meta/meta.json',
      'j:/domains/github/karmaniverous/.meta/meta.json',
      'j:/domains/github/karmaniverous/jeeves-meta/.meta/meta.json',
    ]);

    const node = await buildMinimalNode('j:/domains/github/.meta', watcher);

    // Only karmaniverous is a direct child; jeeves-meta is nested under it
    expect(node.children).toHaveLength(1);
    expect(node.children[0].ownerPath).toBe('j:/domains/github/karmaniverous');
  });

  it('wires parent references on children', async () => {
    const { watcher } = mockWatcher([
      'j:/domains/github/.meta/meta.json',
      'j:/domains/github/karmaniverous/.meta/meta.json',
    ]);

    const node = await buildMinimalNode('j:/domains/github/.meta', watcher);

    expect(node.parent).toBeNull();
    expect(node.children[0].parent).toBe(node);
  });

  it('normalizes backslash paths', async () => {
    const { watcher } = mockWatcher([
      'j:\\domains\\github\\.meta\\meta.json',
      'j:\\domains\\github\\karmaniverous\\.meta\\meta.json',
    ]);

    const node = await buildMinimalNode('j:\\domains\\github\\.meta', watcher);

    expect(node.metaPath).toBe('j:/domains/github/.meta');
    expect(node.children[0].metaPath).toBe(
      'j:/domains/github/karmaniverous/.meta',
    );
  });

  it('passes the correct glob to watcher.walk', async () => {
    const { watcher, walk } = mockWatcher([]);
    await buildMinimalNode('j:/domains/github/.meta', watcher);

    expect(walk).toHaveBeenCalledWith(['j:/domains/github/**/.meta/meta.json']);
  });
});
