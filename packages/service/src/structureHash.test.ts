/**
 * Tests for structureHash computation.
 *
 * @module structureHash.test
 */

import { describe, expect, it } from 'vitest';

import { computeStructureHash } from './structureHash.js';

describe('computeStructureHash', () => {
  it('returns a hex string', () => {
    const hash = computeStructureHash(['a.txt', 'b.txt']);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const a = computeStructureHash(['a.txt', 'b.txt']);
    const b = computeStructureHash(['a.txt', 'b.txt']);
    expect(a).toBe(b);
  });

  it('is order-independent (sorts internally)', () => {
    const a = computeStructureHash(['b.txt', 'a.txt']);
    const b = computeStructureHash(['a.txt', 'b.txt']);
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeStructureHash(['a.txt']);
    const b = computeStructureHash(['b.txt']);
    expect(a).not.toBe(b);
  });

  it('handles empty input', () => {
    const hash = computeStructureHash([]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
