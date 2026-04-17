/**
 * Pure phase-state transition functions.
 *
 * Implements every row of the §8 "Transitions and invalidation cascade" table.
 * No I/O — pure functions over PhaseState and documented inputs.
 *
 * @module phaseState/phaseTransitions
 */

import type { PhaseState } from '../schema/meta.js';

/**
 * Create a fresh (fully-complete) phase state.
 */
export function freshPhaseState(): PhaseState {
  return { architect: 'fresh', builder: 'fresh', critic: 'fresh' };
}

/**
 * Create a phase state for a never-synthesized meta (all pending from architect).
 */
export function initialPhaseState(): PhaseState {
  return { architect: 'pending', builder: 'stale', critic: 'stale' };
}

/**
 * Enforce the per-meta invariant: at most one phase is pending or running,
 * and it is the first non-fresh phase in pipeline order.
 *
 * Stale phases that become the first non-fresh phase are promoted to pending.
 */
export function enforceInvariant(state: PhaseState): PhaseState {
  const result = { ...state };
  let foundNonFresh = false;

  for (const phase of ['architect', 'builder', 'critic'] as const) {
    const s = result[phase];
    if (s === 'fresh') continue;

    if (!foundNonFresh) {
      foundNonFresh = true;
      // First non-fresh: if stale, promote to pending
      if (s === 'stale') {
        result[phase] = 'pending';
      }
      // pending, running, failed stay as-is
    } else {
      // Subsequent non-fresh: must not be pending or running
      if (s === 'pending') {
        result[phase] = 'stale';
      }
      // running in non-first position would be a bug, but don't mask it
    }
  }

  return result;
}

// ── Invalidation cascades ──────────────────────────────────────────────

/**
 * Architect invalidated: architect → pending; builder, critic → stale.
 * Triggers: _structureHash change, _steer change, _architect change,
 * _crossRefs declaration change, _synthesisCount \>= architectEvery.
 */
export function invalidateArchitect(state: PhaseState): PhaseState {
  return enforceInvariant({
    architect: state.architect === 'failed' ? 'failed' : 'pending',
    builder: state.builder === 'fresh' ? 'stale' : state.builder,
    critic: state.critic === 'fresh' ? 'stale' : state.critic,
  });
}

/**
 * Builder invalidated (scope mtime or cross-ref _content change):
 * builder → pending; critic → stale.
 * Only applies when architect is fresh; otherwise, builder stays stale.
 */
export function invalidateBuilder(state: PhaseState): PhaseState {
  if (state.architect !== 'fresh') {
    // Architect is not fresh — builder stays stale (or whatever it is)
    return enforceInvariant({
      ...state,
      builder:
        state.builder === 'fresh' || state.builder === 'stale'
          ? 'stale'
          : state.builder,
      critic: state.critic === 'fresh' ? 'stale' : state.critic,
    });
  }

  return enforceInvariant({
    ...state,
    builder: state.builder === 'failed' ? 'failed' : 'pending',
    critic: state.critic === 'fresh' ? 'stale' : state.critic,
  });
}

// ── Phase success transitions ──────────────────────────────────────────

/**
 * Architect completes successfully.
 * architect → fresh; builder → pending; critic → stale.
 */
export function architectSuccess(state: PhaseState): PhaseState {
  return enforceInvariant({
    architect: 'fresh',
    builder: state.builder === 'failed' ? 'failed' : 'pending',
    critic: state.critic === 'fresh' ? 'stale' : state.critic,
  });
}

/**
 * Builder completes successfully.
 * builder → fresh; critic → pending.
 */
export function builderSuccess(state: PhaseState): PhaseState {
  return enforceInvariant({
    ...state,
    builder: 'fresh',
    critic: state.critic === 'failed' ? 'failed' : 'pending',
  });
}

/**
 * Critic completes successfully.
 * critic → fresh. Meta becomes fully fresh.
 */
export function criticSuccess(state: PhaseState): PhaseState {
  return enforceInvariant({
    ...state,
    critic: 'fresh',
  });
}

// ── Failure transition ─────────────────────────────────────────────────

/**
 * A phase fails (error, timeout, or abort).
 * Target phase → failed; upstream and downstream unchanged.
 */
export function phaseFailed(
  state: PhaseState,
  phase: 'architect' | 'builder' | 'critic',
): PhaseState {
  return enforceInvariant({
    ...state,
    [phase]: 'failed',
  });
}

// ── Surgical retry ─────────────────────────────────────────────────────

/**
 * Retry a failed phase: failed → pending.
 * Only valid when the phase is currently failed.
 */
export function retryPhase(
  state: PhaseState,
  phase: 'architect' | 'builder' | 'critic',
): PhaseState {
  if (state[phase] !== 'failed') return state;
  return enforceInvariant({
    ...state,
    [phase]: 'pending',
  });
}

// ── Running transition ─────────────────────────────────────────────────

/**
 * Mark a phase as running (scheduler picks it).
 */
export function phaseRunning(
  state: PhaseState,
  phase: 'architect' | 'builder' | 'critic',
): PhaseState {
  return {
    ...state,
    [phase]: 'running',
  };
}

// ── Query helpers ──────────────────────────────────────────────────────

/**
 * Get the owed phase: first non-fresh phase in pipeline order, or null.
 */
export function getOwedPhase(
  state: PhaseState,
): 'architect' | 'builder' | 'critic' | null {
  for (const phase of ['architect', 'builder', 'critic'] as const) {
    if (state[phase] !== 'fresh') return phase;
  }
  return null;
}

/**
 * Check if a meta is fully fresh (all phases fresh).
 */
export function isFullyFresh(state: PhaseState): boolean {
  return (
    state.architect === 'fresh' &&
    state.builder === 'fresh' &&
    state.critic === 'fresh'
  );
}

/**
 * Get the scheduler priority band for a meta's owed phase.
 * 1 = critic (highest), 2 = builder, 3 = architect, null = fully fresh.
 */
export function getPriorityBand(state: PhaseState): 1 | 2 | 3 | null {
  const owed = getOwedPhase(state);
  if (!owed) return null;
  if (owed === 'critic') return 1;
  if (owed === 'builder') return 2;
  return 3;
}
