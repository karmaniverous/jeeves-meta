/**
 * Tests for computeCycleTokens — per-cycle token total with
 * _synthesisCount discriminator for architect-skip cycles.
 *
 * @module bootstrap.test
 */

import { describe, expect, it } from 'vitest';

import { computeCycleTokens } from './bootstrap.js';

describe('computeCycleTokens', () => {
  it('sums all three phases when architect ran (_synthesisCount === 1)', () => {
    const meta = {
      _architectTokens: 100,
      _builderTokens: 200,
      _criticTokens: 50,
      _synthesisCount: 1, // post-increment: was 0 → architect ran
    };
    expect(computeCycleTokens(meta)).toBe(350);
  });

  it('sums only builder + critic when architect was skipped (_synthesisCount > 1)', () => {
    const meta = {
      _architectTokens: 100, // stale from previous cycle
      _builderTokens: 200,
      _criticTokens: 50,
      _synthesisCount: 3, // post-increment: was 2 → architect skipped
    };
    expect(computeCycleTokens(meta)).toBe(250);
  });

  it('defaults missing token fields to 0', () => {
    const meta = { _synthesisCount: 1 };
    expect(computeCycleTokens(meta)).toBe(0);
  });

  it('treats missing _synthesisCount as 1 (architect ran)', () => {
    const meta = {
      _architectTokens: 100,
      _builderTokens: 200,
      _criticTokens: 50,
    };
    // _synthesisCount undefined → defaults to 1 → architectRan = true
    expect(computeCycleTokens(meta)).toBe(350);
  });

  it('handles _synthesisCount === 2 (one prior cycle, architect skipped)', () => {
    const meta = {
      _architectTokens: 500,
      _builderTokens: 300,
      _criticTokens: 100,
      _synthesisCount: 2,
    };
    // architect skipped → exclude architectTokens
    expect(computeCycleTokens(meta)).toBe(400);
  });
});
