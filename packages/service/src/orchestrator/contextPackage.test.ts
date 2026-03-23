/**
 * Tests for buildContextPackage — cross-ref resolution.
 *
 * @module orchestrator/contextPackage.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaNode } from '../discovery/types.js';
import type { WatcherClient } from '../interfaces/index.js';
import type { MetaJson } from '../schema/index.js';
import { buildContextPackage } from './contextPackage.js';

const testRoot = join(tmpdir(), `jeeves-meta-ctx-${Date.now().toString()}`);

function createMockWatcher(scopeFiles: string[] = []): WatcherClient {
  return {
    walk: vi.fn().mockResolvedValue(scopeFiles),
    registerRules: vi.fn().mockResolvedValue(undefined),
  };
}

function makeNode(ownerPath: string, metaPath: string) {
  return {
    ownerPath,
    metaPath,
    treeDepth: 0,
    parent: null,
    children: [] as MetaNode[],
  };
}

function writeMetaJson(dir: string, content: Partial<MetaJson>): void {
  const metaDir = join(dir, '.meta');
  mkdirSync(metaDir, { recursive: true });
  writeFileSync(join(metaDir, 'meta.json'), JSON.stringify(content));
}

describe('buildContextPackage — crossRefMetas', () => {
  let ownerDir: string;
  let metaDir: string;
  let refDirA: string;
  let refDirB: string;

  beforeEach(() => {
    ownerDir = join(testRoot, 'owner');
    metaDir = join(ownerDir, '.meta');
    refDirA = join(testRoot, 'refA');
    refDirB = join(testRoot, 'refB');
    mkdirSync(metaDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('resolves cross-refs that exist and have _content', async () => {
    writeMetaJson(refDirA, {
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _content: 'Ref A content',
    });

    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [refDirA],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.crossRefMetas).toHaveProperty(refDirA, 'Ref A content');
  });

  it('sets null for missing cross-refs', async () => {
    const missingPath = join(testRoot, 'nonexistent');
    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [missingPath],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.crossRefMetas).toHaveProperty(missingPath, null);
  });

  it('silently ignores self-references (ownerPath)', async () => {
    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [ownerDir],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(Object.keys(ctx.crossRefMetas)).toHaveLength(0);
  });

  it('silently ignores self-references (metaPath)', async () => {
    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [metaDir],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(Object.keys(ctx.crossRefMetas)).toHaveLength(0);
  });

  it('deduplicates cross-ref paths', async () => {
    writeMetaJson(refDirA, {
      _id: '550e8400-e29b-41d4-a716-446655440000',
      _content: 'Ref A content',
    });

    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [refDirA, refDirA, refDirA],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(Object.keys(ctx.crossRefMetas)).toHaveLength(1);
    expect(ctx.crossRefMetas[refDirA]).toBe('Ref A content');
  });

  it('returns empty crossRefMetas when _crossRefs is absent', async () => {
    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.crossRefMetas).toEqual({});
  });

  it('returns empty crossRefMetas when _crossRefs is empty array', async () => {
    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.crossRefMetas).toEqual({});
  });

  it('sets null for ref that exists but has no _content', async () => {
    writeMetaJson(refDirB, {
      _id: '550e8400-e29b-41d4-a716-446655440000',
    });

    const meta: MetaJson = {
      _id: '550e8400-e29b-41d4-a716-446655440001',
      _crossRefs: [refDirB],
    };
    const node = makeNode(ownerDir, metaDir);
    const watcher = createMockWatcher();

    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.crossRefMetas[refDirB]).toBeNull();
  });
});
