/**
 * Corpus-wide phase scheduler.
 *
 * Selects the highest-priority ready phase across all metas.
 * Priority: critic (band 1) \> builder (band 2) \> architect (band 3).
 * Tiebreak within band: weighted staleness (§3.9).
 *
 * @module phaseState/phaseScheduler
 */

import type { MetaNode } from '../discovery/types.js';
import { computeEffectiveStaleness } from '../scheduling/weightedFormula.js';
import type { MetaJson, PhaseName, PhaseState } from '../schema/index.js';
import { getOwedPhase, getPriorityBand } from './phaseTransitions.js';

/** A candidate for phase-level scheduling. */
export interface PhaseCandidate {
  node: MetaNode;
  meta: MetaJson;
  phaseState: PhaseState;
  owedPhase: PhaseName;
  band: 1 | 2 | 3;
  actualStaleness: number;
  effectiveStaleness: number;
}

/**
 * Select the best phase candidate across the corpus.
 *
 * @param metas - Array of (node, meta, phaseState, stalenessSeconds) tuples.
 * @param depthWeight - Config depthWeight for staleness tiebreak.
 * @returns The winning candidate, or null if no phase is ready.
 */
export function selectPhaseCandidate(
  metas: Array<{
    node: MetaNode;
    meta: MetaJson;
    phaseState: PhaseState;
    actualStaleness: number;
    locked: boolean;
    disabled: boolean;
    isOverride?: boolean;
  }>,
  depthWeight: number,
): PhaseCandidate | null {
  // Filter to metas with a pending (scheduler-eligible) phase
  const eligible = metas.filter((m) => {
    // Locked metas cannot be scheduled
    if (m.locked) return false;
    // Disabled metas excluded unless override
    if (m.disabled && !m.isOverride) return false;

    const owed = getOwedPhase(m.phaseState);
    if (!owed) return false;

    // Only pending phases are scheduler-eligible
    // (stale, running, failed are not ready for picking)
    return m.phaseState[owed] === 'pending';
  });

  if (eligible.length === 0) return null;

  // Compute effective staleness for tiebreaking
  const withStaleness = computeEffectiveStaleness(
    eligible.map((m) => ({
      node: m.node,
      meta: m.meta,
      actualStaleness: m.actualStaleness,
    })),
    depthWeight,
  );

  // Build candidates with band info
  const candidates: PhaseCandidate[] = withStaleness.map((ws, i) => {
    const m = eligible[i];
    const owedPhase = getOwedPhase(m.phaseState)!;
    return {
      node: ws.node,
      meta: ws.meta,
      phaseState: m.phaseState,
      owedPhase,
      band: getPriorityBand(m.phaseState)!,
      actualStaleness: ws.actualStaleness,
      effectiveStaleness: ws.effectiveStaleness,
    };
  });

  // Sort by band (ascending = critic first) then effective staleness (descending)
  candidates.sort((a, b) => {
    if (a.band !== b.band) return a.band - b.band;
    return b.effectiveStaleness - a.effectiveStaleness;
  });

  return candidates[0];
}
