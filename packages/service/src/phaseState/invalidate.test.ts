/**
 * Unit tests for computeInvalidation.
 *
 * Covers every conditional branch: structure hash, steer, crossRefs,
 * architectEvery, prompt staleness, first run, progressive entities,
 * cross-ref content changes, and combinations.
 *
 * @module phaseState/invalidate.test
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaNode } from '../discovery/types.js';
import type { MetaConfig, MetaJson, PhaseState } from '../schema/index.js';
import { computeStructureHash } from '../structureHash.js';

import { computeInvalidation } from './invalidate.js';

// ── Mock readLatestArchive ──────────────────────────────────────────
// We mock at the module level so each test can control the archive return.
let mockArchive: MetaJson | null = null;

vi.mock('../archive/index.js', () => ({
  readLatestArchive: vi.fn(async () => mockArchive),
}));

// ── Mock DEFAULT prompts to stable strings ──────────────────────────
vi.mock('../prompts/index.js', () => ({
  DEFAULT_ARCHITECT_PROMPT: 'default-architect-prompt',
  DEFAULT_CRITIC_PROMPT: 'default-critic-prompt',
}));

// ── Shared fixtures ─────────────────────────────────────────────────

/** Scope files used throughout; hash is stable per set. */
const SCOPE_A = ['file-a.md', 'file-b.md'];
const SCOPE_B = ['file-a.md', 'file-b.md', 'file-c.md'];

const HASH_A = computeStructureHash(SCOPE_A);
const HASH_B = computeStructureHash(SCOPE_B);

function makeConfig(overrides?: Partial<MetaConfig>): MetaConfig {
  return {
    watcherUrl: 'http://localhost:3456',
    gatewayUrl: 'http://127.0.0.1:18789',
    architectEvery: 10,
    depthWeight: 0.5,
    maxArchive: 20,
    maxLines: 500,
    architectTimeout: 120,
    builderTimeout: 600,
    criticTimeout: 300,
    thinking: 'low',
    defaultArchitect: 'default-architect-prompt',
    defaultCritic: 'default-critic-prompt',
    skipUnchanged: true,
    metaProperty: { _meta: 'current' },
    metaArchiveProperty: { _meta: 'archive' },
    ...overrides,
  };
}

const freshPhaseState: PhaseState = {
  architect: 'fresh',
  builder: 'fresh',
  critic: 'fresh',
};

describe('computeInvalidation', () => {
  let testRoot: string;
  let metaPath: string;
  let node: MetaNode;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `invalidate-test-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    metaPath = join(testRoot, 'owner', '.meta');
    mkdirSync(metaPath, { recursive: true });

    node = {
      metaPath,
      ownerPath: join(testRoot, 'owner'),
      treeDepth: 0,
      children: [],
      parent: null,
    };

    // Default: archive exists with matching state
    mockArchive = {
      _steer: undefined,
      _crossRefs: [],
      _builder: 'existing brief',
      _content: 'existing content',
    };
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ── 1. No invalidation needed ───────────────────────────────────

  it('returns unchanged phaseState when fully fresh with no changes', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'existing brief',
      _content: 'output',
      _feedback: 'good',
      _synthesisCount: 3,
      _generatedAt: new Date().toISOString(),
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.phaseState).toEqual(freshPhaseState);
    expect(result.architectInvalidators).toEqual([]);
    expect(result.stalenessInputs.steerChanged).toBe(false);
    expect(result.stalenessInputs.crossRefsDeclChanged).toBe(false);
    expect(result.stalenessInputs.crossRefContentChanged).toBe(false);
  });

  // ── 2. Structure hash mismatch (non-progressive) ───────────────

  it('invalidates architect on structure hash mismatch (non-progressive)', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_B, // different files → different hash
      makeConfig(),
      node,
    );

    expect(result.architectInvalidators).toContain('structureHash');
    expect(result.phaseState.architect).toBe('pending');
    expect(result.phaseState.builder).toBe('stale');
    expect(result.phaseState.critic).toBe('stale');
  });

  // ── 3. Structure hash mismatch (progressive, _state present) ───

  it('invalidates builder only on structure hash mismatch for progressive entity', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _state: { cursor: 5 },
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_B,
      makeConfig(),
      node,
    );

    // structureHash should NOT be in architectInvalidators for progressive
    expect(result.architectInvalidators).not.toContain('structureHash');
    // Builder should be invalidated (pending), architect stays fresh
    expect(result.phaseState.architect).toBe('fresh');
    expect(result.phaseState.builder).toBe('pending');
    expect(result.phaseState.critic).toBe('stale');
  });

  // ── 4. Steer change ────────────────────────────────────────────

  it('invalidates architect on steer change', async () => {
    // Archive has no steer, current meta adds steer
    mockArchive = {
      _steer: undefined,
      _crossRefs: [],
      _builder: 'brief',
    };

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _steer: 'focus on performance',
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.architectInvalidators).toContain('steer');
    expect(result.steerChanged).toBe(true);
    expect(result.phaseState.architect).toBe('pending');
  });

  // ── 5. Cross-ref declaration change ────────────────────────────

  it('invalidates architect on cross-ref declaration change', async () => {
    mockArchive = {
      _crossRefs: ['ref-a'],
      _builder: 'brief',
    };

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _crossRefs: ['ref-a', 'ref-b'], // added ref-b
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.architectInvalidators).toContain('_crossRefs');
    expect(result.stalenessInputs.crossRefsDeclChanged).toBe(true);
    expect(result.phaseState.architect).toBe('pending');
  });

  // ── 6. _synthesisCount >= architectEvery ────────────────────────

  it('invalidates architect when synthesisCount reaches architectEvery', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _synthesisCount: 10,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig({ architectEvery: 10 }),
      node,
    );

    expect(result.architectInvalidators).toContain('architectEvery');
    expect(result.phaseState.architect).toBe('pending');
  });

  // ── 7. Prompt staleness — architect snapshot differs ───────────

  it('bumps synthesisCount to architectEvery when architect prompt is stale', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _architect: 'old-architect-prompt', // differs from config default
      _synthesisCount: 3,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig({ architectEvery: 10 }),
      node,
    );

    // Soft invalidation signals synthesisCountOverride without mutating meta,
    // which triggers the architectEvery invalidator
    expect(meta._synthesisCount).toBe(3); // original value unchanged
    expect(result.synthesisCountOverride).toBe(10);
    expect(result.architectInvalidators).toContain('architectEvery');
    expect(result.stalenessInputs.architectChanged).toBe(true);
  });

  // ── 8. Prompt staleness — critic snapshot differs ──────────────

  it('bumps synthesisCount to architectEvery when critic prompt is stale', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _critic: 'old-critic-prompt', // differs from config default
      _synthesisCount: 2,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig({ architectEvery: 10 }),
      node,
    );

    expect(meta._synthesisCount).toBe(2); // original value unchanged
    expect(result.synthesisCountOverride).toBe(10);
    expect(result.architectInvalidators).toContain('architectEvery');
    expect(result.stalenessInputs.architectChanged).toBe(false);
  });

  // ── 9. First run (no _builder) ─────────────────────────────────

  it('invalidates architect on first run when no _builder exists', async () => {
    mockArchive = null; // no archive either

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _synthesisCount: 0,
      // no _builder
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.phaseState.architect).toBe('pending');
    expect(result.phaseState.builder).toBe('stale');
    expect(result.phaseState.critic).toBe('stale');
  });

  // ── 10. Cross-ref content change → builder-only invalidation ───

  it('invalidates builder only on cross-ref content change', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _crossRefs: ['ref-a'],
      _synthesisCount: 0,
    };

    // Archive has matching crossRefs declaration
    mockArchive = {
      _crossRefs: ['ref-a'],
      _builder: 'brief',
    };

    const crossRefMetas = new Map([['ref-a', 'updated content']]);
    const archiveCrossRefContent = new Map([['ref-a', 'old content']]);

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
      crossRefMetas,
      archiveCrossRefContent,
    );

    expect(result.stalenessInputs.crossRefContentChanged).toBe(true);
    expect(result.architectInvalidators).toEqual([]);
    expect(result.phaseState.architect).toBe('fresh');
    expect(result.phaseState.builder).toBe('pending');
    expect(result.phaseState.critic).toBe('stale');
  });

  // ── 11. Cross-ref content change suppressed by architect invalidation ──

  it('does not double-cascade cross-ref content change when architect is already invalidated', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _steer: 'new steer', // will trigger architect invalidation
      _crossRefs: ['ref-a'],
      _synthesisCount: 0,
    };

    // Archive has different steer → architect invalidated
    mockArchive = {
      _steer: 'old steer',
      _crossRefs: ['ref-a'],
      _builder: 'brief',
    };

    const crossRefMetas = new Map([['ref-a', 'updated content']]);
    const archiveCrossRefContent = new Map([['ref-a', 'old content']]);

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
      crossRefMetas,
      archiveCrossRefContent,
    );

    // Architect is invalidated (steer change)
    expect(result.architectInvalidators).toContain('steer');
    expect(result.stalenessInputs.crossRefContentChanged).toBe(true);
    // Builder invalidation is via architect cascade, not separately applied
    expect(result.phaseState.architect).toBe('pending');
    expect(result.phaseState.builder).toBe('stale');
    expect(result.phaseState.critic).toBe('stale');
  });

  // ── 12. Multiple simultaneous invalidators ─────────────────────

  it('collects multiple architect invalidators when several inputs change', async () => {
    mockArchive = {
      _steer: 'old steer',
      _crossRefs: ['ref-a'],
      _builder: 'brief',
    };

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _steer: 'new steer',
      _crossRefs: ['ref-a', 'ref-b'], // declaration changed
      _synthesisCount: 10, // at architectEvery
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_B, // structure changed too
      makeConfig({ architectEvery: 10 }),
      node,
    );

    expect(result.architectInvalidators).toContain('structureHash');
    expect(result.architectInvalidators).toContain('steer');
    expect(result.architectInvalidators).toContain('_crossRefs');
    expect(result.architectInvalidators).toContain('architectEvery');
    expect(result.architectInvalidators).toHaveLength(4);
    expect(result.phaseState.architect).toBe('pending');
  });

  // ── Additional edge cases ──────────────────────────────────────

  it('derives default phaseState when meta has no _phaseState', async () => {
    const meta: MetaJson = {
      _structureHash: HASH_A,
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    // Should start with default fresh and remain unchanged
    expect(result.phaseState).toBeDefined();
    expect(result.phaseState.architect).toBeDefined();
  });

  it('treats missing archive with non-empty crossRefs as declaration change', async () => {
    mockArchive = null; // no archive

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _crossRefs: ['ref-a'],
      _synthesisCount: 0,
      // no _builder → first run takes priority
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.stalenessInputs.crossRefsDeclChanged).toBe(true);
  });

  it('does not treat matching prompt snapshots as stale', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _architect: 'default-architect-prompt', // matches config default
      _critic: 'default-critic-prompt', // matches config default
      _synthesisCount: 3,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    // No bump — snapshots match
    expect(meta._synthesisCount).toBe(3);
    expect(result.synthesisCountOverride).toBeNull();
    expect(result.stalenessInputs.architectChanged).toBe(false);
    expect(result.architectInvalidators).not.toContain('architectEvery');
  });

  it('does not treat undefined prompt snapshots as stale', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      // _architect and _critic are undefined
      _synthesisCount: 3,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    // isPromptStale returns false when snapshot is undefined
    expect(meta._synthesisCount).toBe(3);
    expect(result.synthesisCountOverride).toBeNull();
    expect(result.stalenessInputs.architectChanged).toBe(false);
  });

  it('cross-ref content change does not invalidate builder on first run', async () => {
    mockArchive = null;

    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      // no _builder → first run
      _synthesisCount: 0,
    };

    const crossRefMetas = new Map([['ref-a', 'content']]);
    const archiveCrossRefContent = new Map([['ref-a', 'old content']]);

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
      crossRefMetas,
      archiveCrossRefContent,
    );

    // First run triggers architect invalidation; builder cascade comes from
    // architect, not from cross-ref content change
    expect(result.phaseState.architect).toBe('pending');
    expect(result.stalenessInputs.crossRefContentChanged).toBe(true);
  });

  it('returns correct structureHash in result', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
    );

    expect(result.structureHash).toBe(HASH_A);
  });

  it('no cross-ref content change when maps are not provided', async () => {
    const meta: MetaJson = {
      _phaseState: { ...freshPhaseState },
      _structureHash: HASH_A,
      _builder: 'brief',
      _synthesisCount: 0,
    };

    const result = await computeInvalidation(
      meta,
      SCOPE_A,
      makeConfig(),
      node,
      // no crossRefMetas or archiveCrossRefContent
    );

    expect(result.stalenessInputs.crossRefContentChanged).toBe(false);
  });
});
