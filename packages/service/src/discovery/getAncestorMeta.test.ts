/**
 * Tests for getAncestorMeta — nearest ancestor meta node lookup.
 *
 * @module discovery/getAncestorMeta.test
 */

import { describe, expect, it } from 'vitest';

import { getAncestorMeta } from './getAncestorMeta.js';
import type { MetaNode } from './types.js';

/** Helper to build a minimal MetaNode for testing. */
function makeNode(metaPath: string, parent: MetaNode | null = null): MetaNode {
  const ownerPath = metaPath.replace(/\/.meta$/, '');
  const node: MetaNode = {
    metaPath,
    ownerPath,
    treeDepth: parent ? parent.treeDepth + 1 : 0,
    children: [],
    parent,
  };
  if (parent) parent.children.push(node);
  return node;
}

describe('getAncestorMeta', () => {
  it('returns null for a root-level meta', () => {
    const root = makeNode('j:/domains/.meta');
    expect(getAncestorMeta(root)).toBeNull();
  });

  it('returns the parent for a direct child meta', () => {
    const root = makeNode('j:/domains/.meta');
    const child = makeNode('j:/domains/github/.meta', root);
    expect(getAncestorMeta(child)).toBe(root);
  });

  it('returns the immediate parent in a nested tree', () => {
    const root = makeNode('j:/domains/.meta');
    const mid = makeNode('j:/domains/github/.meta', root);
    const leaf = makeNode('j:/domains/github/karmaniverous/.meta', mid);
    expect(getAncestorMeta(leaf)).toBe(mid);
    expect(getAncestorMeta(mid)).toBe(root);
  });

  it('returns null for all roots in a flat tree', () => {
    const a = makeNode('j:/domains/a/.meta');
    const b = makeNode('j:/domains/b/.meta');
    expect(getAncestorMeta(a)).toBeNull();
    expect(getAncestorMeta(b)).toBeNull();
  });
});
