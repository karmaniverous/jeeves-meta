/**
 * Tests for computeSummary() — aggregates meta entry statistics.
 *
 * @module discovery/computeSummary.test
 */

import { describe, expect, it } from 'vitest';

import { computeSummary } from './computeSummary.js';
import type { MetaEntry } from './listMetas.js';

/** Build a minimal MetaEntry with overrides. */
function makeEntry(overrides: Partial<MetaEntry> = {}): MetaEntry {
  return {
    path: overrides.path ?? 'j:/test/.meta',
    depth: overrides.depth ?? 0,
    emphasis: overrides.emphasis ?? 1,
    stalenessSeconds: overrides.stalenessSeconds ?? 0,
    lastSynthesized: overrides.lastSynthesized ?? null,
    hasError: overrides.hasError ?? false,
    locked: overrides.locked ?? false,
    architectTokens: overrides.architectTokens ?? null,
    builderTokens: overrides.builderTokens ?? null,
    criticTokens: overrides.criticTokens ?? null,
    disabled: overrides.disabled ?? false,
    children: overrides.children ?? 0,
    node: overrides.node ?? ({} as MetaEntry['node']),
    meta: overrides.meta ?? ({} as MetaEntry['meta']),
  };
}

describe('computeSummary', () => {
  it('returns zeros and nulls for empty entries array', () => {
    const summary = computeSummary([], 0.5);

    expect(summary.total).toBe(0);
    expect(summary.stale).toBe(0);
    expect(summary.errors).toBe(0);
    expect(summary.locked).toBe(0);
    expect(summary.disabled).toBe(0);
    expect(summary.neverSynthesized).toBe(0);
    expect(summary.tokens.architect).toBe(0);
    expect(summary.tokens.builder).toBe(0);
    expect(summary.tokens.critic).toBe(0);
    expect(summary.stalestPath).toBeNull();
    expect(summary.lastSynthesizedPath).toBeNull();
    expect(summary.lastSynthesizedAt).toBeNull();
  });

  it('counts stale entries correctly (stalenessSeconds > 0)', () => {
    const entries = [
      makeEntry({ path: 'j:/a/.meta', stalenessSeconds: 3600 }),
      makeEntry({ path: 'j:/b/.meta', stalenessSeconds: 0 }),
      makeEntry({ path: 'j:/c/.meta', stalenessSeconds: 86400 }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.total).toBe(3);
    expect(summary.stale).toBe(2);
  });

  it('counts errors correctly', () => {
    const entries = [
      makeEntry({ path: 'j:/a/.meta', hasError: true }),
      makeEntry({ path: 'j:/b/.meta', hasError: false }),
      makeEntry({ path: 'j:/c/.meta', hasError: true }),
      makeEntry({ path: 'j:/d/.meta', hasError: true }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.errors).toBe(3);
  });

  it('identifies never-synthesized entries (lastSynthesized === null)', () => {
    const entries = [
      makeEntry({ path: 'j:/a/.meta', lastSynthesized: null }),
      makeEntry({
        path: 'j:/b/.meta',
        lastSynthesized: '2026-03-01T00:00:00Z',
      }),
      makeEntry({ path: 'j:/c/.meta', lastSynthesized: null }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.neverSynthesized).toBe(2);
  });

  it('tracks stalest path (highest effective staleness)', () => {
    const entries = [
      makeEntry({
        path: 'j:/old/.meta',
        stalenessSeconds: 86400,
        depth: 0,
        emphasis: 1,
      }),
      makeEntry({
        path: 'j:/older/.meta',
        stalenessSeconds: 172800,
        depth: 0,
        emphasis: 1,
      }),
      makeEntry({
        path: 'j:/recent/.meta',
        stalenessSeconds: 3600,
        depth: 0,
        emphasis: 1,
      }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.stalestPath).toBe('j:/older/.meta');
  });

  it('tracks last synthesized path (most recent lastSynthesized)', () => {
    const entries = [
      makeEntry({
        path: 'j:/a/.meta',
        lastSynthesized: '2026-01-01T00:00:00Z',
      }),
      makeEntry({
        path: 'j:/b/.meta',
        lastSynthesized: '2026-03-15T12:00:00Z',
      }),
      makeEntry({
        path: 'j:/c/.meta',
        lastSynthesized: '2026-02-01T00:00:00Z',
      }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.lastSynthesizedPath).toBe('j:/b/.meta');
    expect(summary.lastSynthesizedAt).toBe('2026-03-15T12:00:00Z');
  });

  it('accumulates token totals', () => {
    const entries = [
      makeEntry({
        path: 'j:/a/.meta',
        architectTokens: 100,
        builderTokens: 200,
        criticTokens: 50,
      }),
      makeEntry({
        path: 'j:/b/.meta',
        architectTokens: 150,
        builderTokens: null,
        criticTokens: 75,
      }),
      makeEntry({
        path: 'j:/c/.meta',
        architectTokens: null,
        builderTokens: 300,
        criticTokens: null,
      }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.tokens.architect).toBe(250);
    expect(summary.tokens.builder).toBe(500);
    expect(summary.tokens.critic).toBe(125);
  });

  it('accounts for depth and emphasis in stalest calculation', () => {
    // Higher depth with depthWeight > 0 amplifies effective staleness
    const entries = [
      makeEntry({
        path: 'j:/shallow/.meta',
        stalenessSeconds: 10000,
        depth: 0,
        emphasis: 1,
      }),
      makeEntry({
        path: 'j:/deep/.meta',
        stalenessSeconds: 5000,
        depth: 3,
        emphasis: 2,
      }),
    ];

    // depthWeight=1: depthFactor = (1+1)^3 = 8, effective = 5000 * 8 * 2 = 80000
    // shallow: 10000 * 1 * 1 = 10000
    const summary = computeSummary(entries, 1);

    expect(summary.stalestPath).toBe('j:/deep/.meta');
  });

  it('counts locked entries', () => {
    const entries = [
      makeEntry({ path: 'j:/a/.meta', locked: true }),
      makeEntry({ path: 'j:/b/.meta', locked: false }),
      makeEntry({ path: 'j:/c/.meta', locked: true }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.locked).toBe(2);
  });

  it('counts disabled entries', () => {
    const entries = [
      makeEntry({ path: 'j:/a/.meta', disabled: true }),
      makeEntry({ path: 'j:/b/.meta', disabled: false }),
      makeEntry({ path: 'j:/c/.meta', disabled: true }),
    ];

    const summary = computeSummary(entries, 0.5);

    expect(summary.disabled).toBe(2);
  });
});
