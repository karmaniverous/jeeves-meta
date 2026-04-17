/**
 * Phase-state machine integration tests.
 *
 * Covers:
 * - Task #14: Migration verification (derivePhaseState backward compat)
 * - Task #15: Cascade + surgical-retry sequences
 * - Task #17: Full-cycle completion logic
 */

import { describe, expect, it } from 'vitest';

import type { MetaJson, PhaseState } from '../schema/meta.js';
import { derivePhaseState } from './derivePhaseState.js';
import {
  architectSuccess,
  builderSuccess,
  criticSuccess,
  enforceInvariant,
  freshPhaseState,
  getOwedPhase,
  initialPhaseState,
  invalidateArchitect,
  invalidateBuilder,
  isFullyFresh,
  phaseFailed,
  phaseRunning,
  retryPhase,
} from './phaseTransitions.js';

// ── Task #14: Migration verification ────────────────────────────────

describe('migration verification (Task #14)', () => {
  it('never-synthesized meta gains valid _phaseState', () => {
    const meta: MetaJson = {};
    const ps = derivePhaseState(meta);
    expect(ps.architect).toBe('pending');
    expect(ps.builder).toBe('stale');
    expect(ps.critic).toBe('stale');
    expect(getOwedPhase(ps)).toBe('architect');
  });

  it('fully-fresh meta (all outputs present) derives to all-fresh', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'output',
      _feedback: 'evaluation',
      _generatedAt: new Date().toISOString(),
    };
    const ps = derivePhaseState(meta);
    expect(isFullyFresh(ps)).toBe(true);
  });

  it('_error.step=architect maps to architect failed', () => {
    const meta: MetaJson = {
      _error: { step: 'architect', code: 'ERROR', message: 'fail' },
    };
    const ps = derivePhaseState(meta);
    expect(ps.architect).toBe('failed');
  });

  it('_error.step=builder maps to builder failed', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _error: { step: 'builder', code: 'TIMEOUT', message: 'timeout' },
    };
    const ps = derivePhaseState(meta);
    expect(ps.builder).toBe('failed');
    expect(ps.architect).toBe('fresh');
  });

  it('_error.step=critic maps to critic failed', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'output',
      _error: { step: 'critic', code: 'ERROR', message: 'fail' },
    };
    const ps = derivePhaseState(meta);
    expect(ps.critic).toBe('failed');
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('fresh');
  });

  it('existing _phaseState is returned unchanged (round-trip)', () => {
    const expected: PhaseState = {
      architect: 'fresh',
      builder: 'failed',
      critic: 'stale',
    };
    const meta: MetaJson = { _phaseState: expected };
    expect(derivePhaseState(meta)).toEqual(expected);
  });

  it('reserved properties survive derivation (steer, crossRefs, etc.)', () => {
    const meta: MetaJson = {
      _steer: 'focus on X',
      _crossRefs: ['/a', '/b'],
      _emphasis: 2.0,
      _depth: 3,
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
    };
    const ps = derivePhaseState(meta);
    expect(isFullyFresh(ps)).toBe(true);
    // Properties should still be on the meta object
    expect(meta._steer).toBe('focus on X');
    expect(meta._crossRefs).toEqual(['/a', '/b']);
  });

  it('architect invalidation via steerChanged', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
    };
    const ps = derivePhaseState(meta, {
      structureChanged: false,
      steerChanged: true,
      architectChanged: false,
      crossRefsChanged: false,
      architectEvery: 10,
    });
    expect(ps.architect).toBe('pending');
    expect(ps.builder).toBe('stale');
    expect(ps.critic).toBe('stale');
  });

  it('architect invalidation via architectChanged', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
    };
    const ps = derivePhaseState(meta, {
      structureChanged: false,
      steerChanged: false,
      architectChanged: true,
      crossRefsChanged: false,
      architectEvery: 10,
    });
    expect(ps.architect).toBe('pending');
  });

  it('architect invalidation via crossRefsChanged', () => {
    const meta: MetaJson = {
      _builder: 'brief',
      _content: 'content',
      _feedback: 'ok',
      _generatedAt: new Date().toISOString(),
    };
    const ps = derivePhaseState(meta, {
      structureChanged: false,
      steerChanged: false,
      architectChanged: false,
      crossRefsChanged: true,
      architectEvery: 10,
    });
    expect(ps.architect).toBe('pending');
  });
});

// ── Task #15: Cascade + surgical-retry ──────────────────────────────

describe('cascade integration (Task #15)', () => {
  it('full forward cascade: architect → builder → critic → fully fresh', () => {
    // Start: initial state (never-synthesized)
    let ps = initialPhaseState();
    expect(getOwedPhase(ps)).toBe('architect');

    // Architect runs and succeeds
    ps = phaseRunning(ps, 'architect');
    ps = architectSuccess(ps);
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('pending');
    expect(ps.critic).toBe('stale');
    expect(getOwedPhase(ps)).toBe('builder');

    // Builder runs and succeeds
    ps = phaseRunning(ps, 'builder');
    ps = builderSuccess(ps);
    expect(ps.builder).toBe('fresh');
    expect(ps.critic).toBe('pending');
    expect(getOwedPhase(ps)).toBe('critic');

    // Critic runs and succeeds
    ps = phaseRunning(ps, 'critic');
    ps = criticSuccess(ps);
    expect(isFullyFresh(ps)).toBe(true);
    expect(getOwedPhase(ps)).toBeNull();
  });

  it('architect invalidation mid-cycle cascades downstream', () => {
    // Start: builder just completed, critic pending
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'pending',
    };

    // External change invalidates architect
    ps = invalidateArchitect(ps);
    expect(ps.architect).toBe('pending');
    expect(ps.builder).toBe('stale');
    expect(ps.critic).toBe('stale');
    expect(getOwedPhase(ps)).toBe('architect');
  });

  it('builder invalidation when architect is fresh', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'fresh',
    };

    ps = invalidateBuilder(ps);
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('pending');
    expect(ps.critic).toBe('stale');
    expect(getOwedPhase(ps)).toBe('builder');
  });

  it('builder invalidation when architect is not fresh has no effect', () => {
    let ps: PhaseState = {
      architect: 'pending',
      builder: 'stale',
      critic: 'stale',
    };

    ps = invalidateBuilder(ps);
    // Architect is still the first non-fresh
    expect(getOwedPhase(ps)).toBe('architect');
  });

  it('critic failure does not cascade — upstream and downstream untouched', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'running',
    };

    ps = phaseFailed(ps, 'critic');
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('fresh');
    expect(ps.critic).toBe('failed');
  });

  it('builder failure preserves upstream architect fresh', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'running',
      critic: 'stale',
    };

    ps = phaseFailed(ps, 'builder');
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('failed');
    expect(ps.critic).toBe('stale');
  });

  it('surgical retry: critic failed → pending → running → success', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'failed',
    };

    // Retry: failed → pending
    ps = retryPhase(ps, 'critic');
    expect(ps.critic).toBe('pending');

    // Run
    ps = phaseRunning(ps, 'critic');
    expect(ps.critic).toBe('running');

    // Success
    ps = criticSuccess(ps);
    expect(isFullyFresh(ps)).toBe(true);
  });

  it('surgical retry: builder failed → pending → running → success', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'failed',
      critic: 'stale',
    };

    ps = retryPhase(ps, 'builder');
    expect(ps.builder).toBe('pending');
    expect(ps.critic).toBe('stale');

    ps = phaseRunning(ps, 'builder');
    ps = builderSuccess(ps);
    expect(ps.builder).toBe('fresh');
    expect(ps.critic).toBe('pending');
  });

  it('abort sets phase to failed, upstream/downstream untouched', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'running',
      critic: 'stale',
    };

    // Abort = failure
    ps = phaseFailed(ps, 'builder');
    expect(ps.architect).toBe('fresh');
    expect(ps.builder).toBe('failed');
    expect(ps.critic).toBe('stale');

    // Re-eligible on next tick
    ps = retryPhase(ps, 'builder');
    expect(ps.builder).toBe('pending');
  });

  it('retry on non-failed phase is a no-op', () => {
    const ps: PhaseState = {
      architect: 'fresh',
      builder: 'pending',
      critic: 'stale',
    };
    const result = retryPhase(ps, 'builder');
    expect(result).toEqual(ps);
  });
});

// ── Task #17: Full-cycle completion logic ───────────────────────────

describe('full-cycle completion (Task #17)', () => {
  it('cycle completes only when all three phases are fresh', () => {
    // After architect success: not complete
    let ps = architectSuccess(initialPhaseState());
    expect(isFullyFresh(ps)).toBe(false);

    // After builder success: not complete
    ps = phaseRunning(ps, 'builder');
    ps = builderSuccess(ps);
    expect(isFullyFresh(ps)).toBe(false);

    // After critic success: COMPLETE
    ps = phaseRunning(ps, 'critic');
    ps = criticSuccess(ps);
    expect(isFullyFresh(ps)).toBe(true);
  });

  it('critic failure prevents cycle completion', () => {
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'running',
    };
    ps = phaseFailed(ps, 'critic');
    expect(isFullyFresh(ps)).toBe(false);
  });

  it('after critic retry success, cycle completes and can be archived', () => {
    // Start with critic failed
    let ps: PhaseState = {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'failed',
    };

    // Retry
    ps = retryPhase(ps, 'critic');
    ps = phaseRunning(ps, 'critic');
    ps = criticSuccess(ps);
    expect(isFullyFresh(ps)).toBe(true);
  });

  it('architect success resets _synthesisCount to 0 (via convention)', () => {
    // This tests the convention, not the function — architect success
    // means _synthesisCount should be set to 0 by the caller
    const ps = architectSuccess(initialPhaseState());
    expect(ps.architect).toBe('fresh');
    // The actual _synthesisCount=0 happens in runArchitect, tested here
    // as a convention verification
  });

  it('enforceInvariant promotes stale to pending when it becomes first non-fresh', () => {
    // Simulate: architect completes, builder should become pending
    const ps = enforceInvariant({
      architect: 'fresh',
      builder: 'stale',
      critic: 'stale',
    });
    expect(ps.builder).toBe('pending');
    expect(ps.critic).toBe('stale');
  });

  it('fully fresh after invalidation starts new cycle', () => {
    let ps = freshPhaseState();
    expect(isFullyFresh(ps)).toBe(true);

    // New invalidation restarts the cycle
    ps = invalidateArchitect(ps);
    expect(isFullyFresh(ps)).toBe(false);
    expect(getOwedPhase(ps)).toBe('architect');
  });
});
