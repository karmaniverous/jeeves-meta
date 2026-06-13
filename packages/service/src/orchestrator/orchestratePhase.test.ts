/**
 * Tests for orchestratePhase helpers — isEmptyScope predicate.
 *
 * @module orchestrator/orchestratePhase.test
 */

import { describe, expect, it } from 'vitest';

import type { MetaNode } from '../discovery/types.js';
import type { MetaJson } from '../schema/index.js';
import { isEmptyScope } from './orchestratePhase.js';

function makeNode(children: MetaNode[] = []): MetaNode {
  return {
    metaPath: '/test/.meta',
    ownerPath: '/test',
    treeDepth: 0,
    children,
    parent: null,
  };
}

describe('isEmptyScope', () => {
  it('returns true when scope is empty, no children, no crossRefs, no content', () => {
    const node = makeNode();
    const meta: MetaJson = {};
    expect(isEmptyScope([], node, meta)).toBe(true);
  });

  it('returns false when scopeFiles is non-empty', () => {
    const node = makeNode();
    const meta: MetaJson = {};
    expect(isEmptyScope(['/test/file.md'], node, meta)).toBe(false);
  });

  it('returns false when node has children', () => {
    const child: MetaNode = {
      metaPath: '/test/sub/.meta',
      ownerPath: '/test/sub',
      treeDepth: 1,
      children: [],
      parent: null,
    };
    const node = makeNode([child]);
    const meta: MetaJson = {};
    expect(isEmptyScope([], node, meta)).toBe(false);
  });

  it('returns false when meta has crossRefs', () => {
    const node = makeNode();
    const meta: MetaJson = { _crossRefs: ['j:/other/path'] };
    expect(isEmptyScope([], node, meta)).toBe(false);
  });

  it('returns false when meta has empty crossRefs array', () => {
    const node = makeNode();
    const meta: MetaJson = { _crossRefs: [] };
    // Empty array → no cross-refs → still empty scope
    expect(isEmptyScope([], node, meta)).toBe(true);
  });

  it('returns false when meta has prior _content', () => {
    const node = makeNode();
    const meta: MetaJson = { _content: '# Previous synthesis' };
    expect(isEmptyScope([], node, meta)).toBe(false);
  });

  it('returns true when _crossRefs is undefined', () => {
    const node = makeNode();
    const meta: MetaJson = {};
    expect(isEmptyScope([], node, meta)).toBe(true);
  });
});
