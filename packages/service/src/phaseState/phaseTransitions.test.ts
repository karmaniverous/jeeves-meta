import { describe, expect, it } from 'vitest';

import type { PhaseState } from '../schema/meta.js';
import {
  architectSuccess,
  builderSuccess,
  criticSuccess,
  enforceInvariant,
  freshPhaseState,
  getOwedPhase,
  getPriorityBand,
  initialPhaseState,
  invalidateArchitect,
  invalidateBuilder,
  isFullyFresh,
  phaseFailed,
  phaseRunning,
  retryAllFailed,
  retryPhase,
} from './phaseTransitions.js';

describe('phaseTransitions', () => {
  describe('freshPhaseState', () => {
    it('returns all fresh', () => {
      expect(freshPhaseState()).toEqual({
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      });
    });
  });

  describe('initialPhaseState', () => {
    it('returns architect pending, downstream stale', () => {
      expect(initialPhaseState()).toEqual({
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      });
    });
  });

  describe('enforceInvariant', () => {
    it('promotes first stale to pending', () => {
      const result = enforceInvariant({
        architect: 'fresh',
        builder: 'stale',
        critic: 'stale',
      });
      expect(result).toEqual({
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      });
    });

    it('demotes non-first pending to stale', () => {
      const result = enforceInvariant({
        architect: 'pending',
        builder: 'pending',
        critic: 'stale',
      });
      expect(result).toEqual({
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      });
    });

    it('leaves failed as first non-fresh', () => {
      const result = enforceInvariant({
        architect: 'fresh',
        builder: 'failed',
        critic: 'stale',
      });
      expect(result).toEqual({
        architect: 'fresh',
        builder: 'failed',
        critic: 'stale',
      });
    });

    it('preserves fully fresh', () => {
      const result = enforceInvariant(freshPhaseState());
      expect(result).toEqual(freshPhaseState());
    });
  });

  // ── Invalidation cascades ──

  describe('invalidateArchitect', () => {
    it('fresh → architect pending, downstream stale', () => {
      const result = invalidateArchitect(freshPhaseState());
      expect(result).toEqual({
        architect: 'pending',
        builder: 'stale',
        critic: 'stale',
      });
    });

    it('preserves failed architect', () => {
      const state: PhaseState = {
        architect: 'failed',
        builder: 'fresh',
        critic: 'fresh',
      };
      const result = invalidateArchitect(state);
      expect(result.architect).toBe('failed');
    });

    it('already-stale builder stays stale', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'stale',
        critic: 'fresh',
      };
      const result = invalidateArchitect(state);
      expect(result.builder).toBe('stale');
    });
  });

  describe('invalidateBuilder', () => {
    it('builder → pending when architect is fresh', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      };
      const result = invalidateBuilder(state);
      expect(result).toEqual({
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      });
    });

    it('builder stays stale when architect is not fresh', () => {
      const state: PhaseState = {
        architect: 'pending',
        builder: 'fresh',
        critic: 'fresh',
      };
      const result = invalidateBuilder(state);
      expect(result.architect).toBe('pending');
      expect(result.builder).toBe('stale');
    });

    it('preserves failed builder', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'failed',
        critic: 'fresh',
      };
      const result = invalidateBuilder(state);
      expect(result.builder).toBe('failed');
    });
  });

  // ── Phase success transitions ──

  describe('architectSuccess', () => {
    it('architect → fresh, builder → pending, critic → stale', () => {
      const state: PhaseState = {
        architect: 'running',
        builder: 'stale',
        critic: 'stale',
      };
      const result = architectSuccess(state);
      expect(result).toEqual({
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      });
    });

    it('preserves failed builder', () => {
      const state: PhaseState = {
        architect: 'running',
        builder: 'failed',
        critic: 'stale',
      };
      const result = architectSuccess(state);
      expect(result.builder).toBe('failed');
    });
  });

  describe('builderSuccess', () => {
    it('builder → fresh, critic → pending', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'running',
        critic: 'stale',
      };
      const result = builderSuccess(state);
      expect(result).toEqual({
        architect: 'fresh',
        builder: 'fresh',
        critic: 'pending',
      });
    });

    it('preserves failed critic', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'running',
        critic: 'failed',
      };
      const result = builderSuccess(state);
      expect(result.builder).toBe('fresh');
      expect(result.critic).toBe('failed');
    });
  });

  describe('criticSuccess', () => {
    it('critic → fresh, meta fully fresh', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'running',
      };
      const result = criticSuccess(state);
      expect(isFullyFresh(result)).toBe(true);
    });
  });

  // ── Failure ──

  describe('phaseFailed', () => {
    it('running architect → failed, downstream unchanged', () => {
      const state: PhaseState = {
        architect: 'running',
        builder: 'stale',
        critic: 'stale',
      };
      const result = phaseFailed(state, 'architect');
      expect(result.architect).toBe('failed');
      expect(result.builder).toBe('stale');
      expect(result.critic).toBe('stale');
    });

    it('running builder → failed, critic unchanged', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'running',
        critic: 'stale',
      };
      const result = phaseFailed(state, 'builder');
      expect(result.builder).toBe('failed');
      expect(result.critic).toBe('stale');
    });

    it('running critic → failed, upstream unchanged', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'running',
      };
      const result = phaseFailed(state, 'critic');
      expect(result.architect).toBe('fresh');
      expect(result.builder).toBe('fresh');
      expect(result.critic).toBe('failed');
    });
  });

  // ── Surgical retry ──

  describe('retryPhase', () => {
    it('failed → pending', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'failed',
        critic: 'stale',
      };
      const result = retryPhase(state, 'builder');
      expect(result.builder).toBe('pending');
    });

    it('no-op if not failed', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      };
      const result = retryPhase(state, 'builder');
      expect(result).toBe(state);
    });

    it('critic retry: pending', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'failed',
      };
      const result = retryPhase(state, 'critic');
      expect(result.critic).toBe('pending');
    });
  });

  describe('retryAllFailed', () => {
    it('no-op when no phases are failed', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      };
      const result = retryAllFailed(state);
      expect(result).toEqual(state);
    });

    it('retries single failed phase', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'failed',
        critic: 'stale',
      };
      const result = retryAllFailed(state);
      expect(result.builder).toBe('pending');
      expect(result.critic).toBe('stale');
    });

    it('retries multiple failed phases — first becomes pending, rest stay stale', () => {
      const state: PhaseState = {
        architect: 'failed',
        builder: 'failed',
        critic: 'failed',
      };
      const result = retryAllFailed(state);
      // enforceInvariant promotes only the first non-fresh to pending
      expect(result.architect).toBe('pending');
      expect(result.builder).toBe('stale');
      expect(result.critic).toBe('stale');
    });

    it('retries two downstream failed phases', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'failed',
        critic: 'failed',
      };
      const result = retryAllFailed(state);
      expect(result.builder).toBe('pending');
      expect(result.critic).toBe('stale');
    });
  });

  // ── Running ──

  describe('phaseRunning', () => {
    it('marks phase as running', () => {
      const state: PhaseState = {
        architect: 'fresh',
        builder: 'pending',
        critic: 'stale',
      };
      const result = phaseRunning(state, 'builder');
      expect(result.builder).toBe('running');
    });
  });

  // ── Query helpers ──

  describe('getOwedPhase', () => {
    it('returns null for fully fresh', () => {
      expect(getOwedPhase(freshPhaseState())).toBeNull();
    });

    it('returns architect when architect is not fresh', () => {
      expect(
        getOwedPhase({
          architect: 'pending',
          builder: 'stale',
          critic: 'stale',
        }),
      ).toBe('architect');
    });

    it('returns builder when architect is fresh', () => {
      expect(
        getOwedPhase({
          architect: 'fresh',
          builder: 'pending',
          critic: 'stale',
        }),
      ).toBe('builder');
    });

    it('returns critic when architect+builder fresh', () => {
      expect(
        getOwedPhase({
          architect: 'fresh',
          builder: 'fresh',
          critic: 'pending',
        }),
      ).toBe('critic');
    });

    it('returns failed phase', () => {
      expect(
        getOwedPhase({
          architect: 'fresh',
          builder: 'fresh',
          critic: 'failed',
        }),
      ).toBe('critic');
    });
  });

  describe('getPriorityBand', () => {
    it('critic = 1', () => {
      expect(
        getPriorityBand({
          architect: 'fresh',
          builder: 'fresh',
          critic: 'pending',
        }),
      ).toBe(1);
    });
    it('builder = 2', () => {
      expect(
        getPriorityBand({
          architect: 'fresh',
          builder: 'pending',
          critic: 'stale',
        }),
      ).toBe(2);
    });
    it('architect = 3', () => {
      expect(
        getPriorityBand({
          architect: 'pending',
          builder: 'stale',
          critic: 'stale',
        }),
      ).toBe(3);
    });
    it('fully fresh = null', () => {
      expect(getPriorityBand(freshPhaseState())).toBeNull();
    });
  });

  describe('isFullyFresh', () => {
    it('true for all fresh', () => {
      expect(isFullyFresh(freshPhaseState())).toBe(true);
    });
    it('false if any non-fresh', () => {
      expect(
        isFullyFresh({
          architect: 'fresh',
          builder: 'fresh',
          critic: 'pending',
        }),
      ).toBe(false);
    });
  });
});
