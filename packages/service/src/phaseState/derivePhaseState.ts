/**
 * Backward-compatible derivation of _phaseState from existing meta fields.
 *
 * When a meta is loaded from disk without _phaseState, this reconstructs
 * the phase state from _content, _builder, _state, _error.step, and
 * the architect-invalidating inputs.
 *
 * @module phaseState/derivePhaseState
 */

import type { MetaJson, PhaseState } from '../schema/index.js';
import { freshPhaseState, initialPhaseState } from './phaseTransitions.js';

/** Inputs needed to determine architect invalidation for derivation. */
export interface DerivationInputs {
  /** Whether _structureHash has changed vs. computed value. */
  structureChanged: boolean;
  /** Whether _steer changed vs. latest archive. */
  steerChanged: boolean;
  /** Whether _architect prompt changed. */
  architectChanged: boolean;
  /** Whether _crossRefs declaration changed. */
  crossRefsChanged: boolean;
  /** architectEvery config value. */
  architectEvery: number;
}

/**
 * Derive _phaseState from existing meta fields.
 *
 * If the meta already has _phaseState, returns it as-is.
 *
 * Otherwise, reconstructs from available fields:
 * - Never-synthesized meta (no _content, no _builder): all phases start pending/stale.
 * - Errored meta: the failed phase is mapped from _error.step.
 * - Mid-cycle meta with cached _builder but no _content: builder pending.
 * - Fully-fresh meta: all phases fresh.
 * - Meta with stale architect inputs: architect pending, downstream stale.
 *
 * @param meta - The meta.json content.
 * @param inputs - Optional derivation inputs. If not provided, a simpler
 *   heuristic is used (no architect invalidation check).
 * @returns The derived PhaseState.
 */
export function derivePhaseState(
  meta: MetaJson,
  inputs?: DerivationInputs,
): PhaseState {
  // Already has _phaseState — use it
  if (meta._phaseState) return meta._phaseState;

  // Check for errors first — _error.step maps directly to failed phase
  if (meta._error) {
    const failedPhase = meta._error.step;
    const state = freshPhaseState();
    state[failedPhase] = 'failed';

    // If architect failed and no _builder, downstream is stale
    if (failedPhase === 'architect') {
      if (!meta._builder) {
        state.builder = 'stale';
        state.critic = 'stale';
      }
    }
    // If builder failed, critic is stale
    if (failedPhase === 'builder') {
      state.critic = 'stale';
    }

    return state;
  }

  // Never synthesized: no _content AND no _builder (and no error)
  if (!meta._content && !meta._builder) {
    return initialPhaseState();
  }

  // Check architect invalidation (when inputs are provided)
  if (inputs) {
    const architectInvalidated =
      inputs.structureChanged ||
      inputs.steerChanged ||
      inputs.architectChanged ||
      inputs.crossRefsChanged ||
      (meta._synthesisCount ?? 0) >= inputs.architectEvery;

    if (architectInvalidated) {
      return {
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      };
    }
  }

  // Has _builder but no _content: builder is pending
  if (meta._builder && !meta._content) {
    return {
      architect: 'fresh',
      builder: 'pending',
      critic: 'stale',
    };
  }

  // Has _content but no _feedback: critic is pending
  if (meta._content && !meta._feedback) {
    return {
      architect: 'fresh',
      builder: 'fresh',
      critic: 'pending',
    };
  }

  // Default: fully fresh
  return freshPhaseState();
}
