/**
 * Tests for buildContextPackage — cross-ref resolution and delta-aware
 * child meta filtering.
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

describe('buildContextPackage — delta-aware child metas', () => {
  let ownerDir: string;
  let metaDir: string;

  beforeEach(() => {
    ownerDir = join(testRoot, 'parent');
    metaDir = join(ownerDir, '.meta');
    mkdirSync(metaDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  function makeChildNode(name: string): MetaNode {
    const childOwner = join(ownerDir, name);
    const childMeta = join(childOwner, '.meta');
    return {
      ownerPath: childOwner,
      metaPath: childMeta,
      treeDepth: 1,
      parent: null,
      children: [],
    };
  }

  it('includes full _content for children synthesized after parent', async () => {
    const child = makeChildNode('new-child');
    mkdirSync(child.metaPath, { recursive: true });
    writeFileSync(
      join(child.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c1',
        _content: 'new child content',
        _generatedAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(child);

    const meta: MetaJson = {
      _id: 'p1',
      _generatedAt: '2026-04-01T00:00:00.000Z',
    };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.childMetas[child.ownerPath]).toBe('new child content');
  });

  it('excludes _content for children synthesized before parent', async () => {
    const child = makeChildNode('old-child');
    mkdirSync(child.metaPath, { recursive: true });
    writeFileSync(
      join(child.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c2',
        _content: 'old child content that should be omitted',
        _generatedAt: '2026-03-01T00:00:00.000Z',
      }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(child);

    const meta: MetaJson = {
      _id: 'p2',
      _generatedAt: '2026-04-01T00:00:00.000Z',
    };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.childMetas[child.ownerPath]).toBeNull();
  });

  it('includes all children on first run (no parent _generatedAt)', async () => {
    const child = makeChildNode('any-child');
    mkdirSync(child.metaPath, { recursive: true });
    writeFileSync(
      join(child.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c3',
        _content: 'child content',
        _generatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(child);

    const meta: MetaJson = { _id: 'p3' };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.childMetas[child.ownerPath]).toBe('child content');
  });

  it('includes child with no _generatedAt (never synthesized)', async () => {
    const child = makeChildNode('unsynthesized');
    mkdirSync(child.metaPath, { recursive: true });
    writeFileSync(
      join(child.metaPath, 'meta.json'),
      JSON.stringify({ _id: 'c4', _content: 'brand new' }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(child);

    const meta: MetaJson = {
      _id: 'p4',
      _generatedAt: '2026-04-01T00:00:00.000Z',
    };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.childMetas[child.ownerPath]).toBe('brand new');
  });

  it('correctly splits a mix of delta and non-delta children', async () => {
    const oldChild = makeChildNode('old');
    const newChild = makeChildNode('new');
    mkdirSync(oldChild.metaPath, { recursive: true });
    mkdirSync(newChild.metaPath, { recursive: true });
    writeFileSync(
      join(oldChild.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c5',
        _content: 'old stuff',
        _generatedAt: '2026-02-01T00:00:00.000Z',
      }),
    );
    writeFileSync(
      join(newChild.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c6',
        _content: 'new stuff',
        _generatedAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(oldChild, newChild);

    const meta: MetaJson = {
      _id: 'p5',
      _generatedAt: '2026-04-01T00:00:00.000Z',
    };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    expect(ctx.childMetas[oldChild.ownerPath]).toBeNull();
    expect(ctx.childMetas[newChild.ownerPath]).toBe('new stuff');
  });

  it('sets undefined for delta child with no _content (not yet synthesized)', async () => {
    const child = makeChildNode('empty-delta');
    mkdirSync(child.metaPath, { recursive: true });
    writeFileSync(
      join(child.metaPath, 'meta.json'),
      JSON.stringify({
        _id: 'c7',
        _generatedAt: '2026-05-01T00:00:00.000Z',
      }),
    );

    const node = makeNode(ownerDir, metaDir);
    node.children.push(child);

    const meta: MetaJson = {
      _id: 'p6',
      _generatedAt: '2026-04-01T00:00:00.000Z',
    };
    const watcher = createMockWatcher();
    const ctx = await buildContextPackage(node, meta, watcher);

    // Delta child without _content → undefined (not null)
    expect(ctx.childMetas).toHaveProperty(child.ownerPath);
    expect(ctx.childMetas[child.ownerPath]).toBeUndefined();
  });
});
