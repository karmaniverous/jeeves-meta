/**
 * Tests for scope enumeration — filterInScope, getScopeFiles, getDeltaFiles.
 *
 * @module discovery/scope.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { WatcherClient } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import { filterInScope, getDeltaFiles, getScopeFiles } from './scope.js';
import type { MetaNode } from './types.js';

// ── Helpers ──

function makeNode(ownerPath: string, children: MetaNode[] = []): MetaNode {
  const node: MetaNode = {
    metaPath: ownerPath + '/.meta',
    ownerPath,
    treeDepth: 0,
    children,
    parent: null,
  };
  for (const c of children) {
    c.parent = node;
  }
  return node;
}

function makeChild(ownerPath: string): MetaNode {
  return {
    metaPath: ownerPath + '/.meta',
    ownerPath,
    treeDepth: 1,
    children: [],
    parent: null,
  };
}

function mockWatcher(paths: string[]) {
  const walkFn = vi.fn().mockResolvedValue(paths);
  const watcher: WatcherClient = {
    registerRules: vi.fn().mockResolvedValue(undefined),
    walk: walkFn,
  };
  return { watcher, walk: walkFn };
}

// ── filterInScope ──

describe('filterInScope', () => {
  it('includes files under ownerPath', () => {
    const node = makeNode('j:/domains/email');
    const files = [
      'j:/domains/email/archive/2026-01.json',
      'j:/domains/email/config.json',
    ];
    expect(filterInScope(node, files)).toEqual(files);
  });

  it('excludes files outside ownerPath', () => {
    const node = makeNode('j:/domains/email');
    const files = ['j:/domains/github/readme.md', 'j:/other/file.txt'];
    expect(filterInScope(node, files)).toEqual([]);
  });

  it('excludes own .meta/ subtree', () => {
    const node = makeNode('j:/domains/email');
    const files = [
      'j:/domains/email/data.json',
      'j:/domains/email/.meta/meta.json',
      'j:/domains/email/.meta/archive/2026-01.json',
    ];
    expect(filterInScope(node, files)).toEqual(['j:/domains/email/data.json']);
  });

  it('excludes child meta ownerPath subtrees', () => {
    const child = makeChild('j:/domains/email/newsletters');
    const node = makeNode('j:/domains/email', [child]);
    const files = [
      'j:/domains/email/config.json',
      'j:/domains/email/newsletters/jan.md',
      'j:/domains/email/newsletters/feb.md',
    ];
    expect(filterInScope(node, files)).toEqual([
      'j:/domains/email/config.json',
    ]);
  });

  it('includes child .meta/meta.json as rollup input', () => {
    const child = makeChild('j:/domains/email/newsletters');
    const node = makeNode('j:/domains/email', [child]);
    const files = [
      'j:/domains/email/config.json',
      'j:/domains/email/newsletters/.meta/meta.json',
    ];
    const result = filterInScope(node, files);
    expect(result).toContain('j:/domains/email/newsletters/.meta/meta.json');
    expect(result).toContain('j:/domains/email/config.json');
  });

  it('excludes child .meta/archive files (not rollup inputs)', () => {
    const child = makeChild('j:/domains/email/newsletters');
    const node = makeNode('j:/domains/email', [child]);
    const files = ['j:/domains/email/newsletters/.meta/archive/2026-01.json'];
    expect(filterInScope(node, files)).toEqual([]);
  });
});

// ── getScopeFiles ──

describe('getScopeFiles', () => {
  it('calls watcher.walk with ownerPath glob', async () => {
    const { watcher, walk } = mockWatcher([]);
    const node = makeNode('j:/domains/email');
    await getScopeFiles(node, watcher);

    expect(walk).toHaveBeenCalledWith(['j:/domains/email/**']);
  });

  it('returns filtered scope files and all files', async () => {
    const allFiles = [
      'j:/domains/email/data.json',
      'j:/domains/email/.meta/meta.json',
    ];
    const { watcher } = mockWatcher(allFiles);
    const node = makeNode('j:/domains/email');

    const result = await getScopeFiles(node, watcher);
    expect(result.allFiles).toEqual(allFiles);
    expect(result.scopeFiles).toEqual(['j:/domains/email/data.json']);
  });

  it('normalizes backslash paths from watcher walk (#77)', async () => {
    // Watcher may return backslash-separated paths on Windows
    const backslashFiles = [
      'j:\\domains\\email\\data.json',
      'j:\\domains\\email\\.meta\\meta.json',
    ];
    const { watcher } = mockWatcher(backslashFiles);
    const node = makeNode('j:/domains/email');

    const result = await getScopeFiles(node, watcher);
    // allFiles should be normalized to forward slashes
    expect(result.allFiles).toEqual([
      'j:/domains/email/data.json',
      'j:/domains/email/.meta/meta.json',
    ]);
    // scopeFiles should correctly filter (exclude .meta/)
    expect(result.scopeFiles).toEqual(['j:/domains/email/data.json']);
  });

  it('handles paths with spaces and special characters (#77)', async () => {
    const backslashFiles = [
      'j:\\veterancrowd\\calendar\\bob@vc.com\\Bob Louthan\\event.json',
      "j:\\veterancrowd\\calendar\\bob@vc.com\\Men's Basketball\\event.json",
      'j:\\veterancrowd\\calendar\\bob@vc.com\\Bob Louthan\\.meta\\meta.json',
    ];
    const { watcher } = mockWatcher(backslashFiles);
    const child = makeChild('j:/veterancrowd/calendar/bob@vc.com/Bob Louthan');
    const node = makeNode('j:/veterancrowd/calendar/bob@vc.com', [child]);

    const result = await getScopeFiles(node, watcher);
    expect(result.allFiles).toHaveLength(3);
    // Child subtree excluded except child meta.json
    expect(result.scopeFiles).toEqual([
      "j:/veterancrowd/calendar/bob@vc.com/Men's Basketball/event.json",
      'j:/veterancrowd/calendar/bob@vc.com/Bob Louthan/.meta/meta.json',
    ]);
  });
});

// ── getDeltaFiles ──

describe('getDeltaFiles', () => {
  const testDir = join(tmpdir(), `scope-test-${Date.now().toString()}`);
  const oldFile = normalizePath(join(testDir, 'old.txt'));
  const newFile = normalizePath(join(testDir, 'new.txt'));

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    // Create old file with past mtime
    writeFileSync(join(testDir, 'old.txt'), 'old');
    // Create new file (current mtime)
    writeFileSync(join(testDir, 'new.txt'), 'new');
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns all scope files when generatedAt is undefined (first run)', () => {
    const files = [oldFile, newFile];
    expect(getDeltaFiles(undefined, files)).toEqual(files);
  });

  it('filters to files modified after generatedAt', () => {
    // generatedAt far in the past — both files should be included
    const result = getDeltaFiles('2000-01-01T00:00:00Z', [oldFile, newFile]);
    expect(result).toContain(newFile);
    expect(result).toContain(oldFile);
  });

  it('returns empty when generatedAt is in the future', () => {
    const result = getDeltaFiles('2099-01-01T00:00:00Z', [oldFile, newFile]);
    expect(result).toEqual([]);
  });

  it('handles unreadable files gracefully (excludes them)', () => {
    const result = getDeltaFiles('2000-01-01T00:00:00Z', [
      '/nonexistent/path.txt',
      newFile,
    ]);
    expect(result).toEqual([newFile]);
  });
});
