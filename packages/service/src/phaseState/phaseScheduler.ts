/**
 * Corpus-wide phase scheduler.
 *
 * Selects the highest-priority ready phase across all metas.
 * Priority: critic (band 1) \> builder (band 2) \> architect (band 3).
 * Tiebreak within band: weighted staleness (§3.9).
 *
 * @module phaseState/phaseScheduler
 */

import type { MetaEntry } from '../discovery/listMetas.js';
import type { MetaNode } from '../discovery/types.js';
import { computeEffectiveStaleness } from '../scheduling/weightedFormula.js';
import type { MetaJson, PhaseName, PhaseState } from '../schema/index.js';
import { derivePhaseState } from './derivePhaseState.js';
import {
  getOwedPhase,
  getPriorityBand,
  retryAllFailed,
} from './phaseTransitions.js';

/** Input for phase candidate selection (from listMetas entries). */
export interface PhaseCandidateInput {
  node: MetaNode;
  meta: MetaJson;
  phaseState: PhaseState;
  actualStaleness: number;
  locked: boolean;
  disabled: boolean;
  isOverride?: boolean;
}

/**
 * Build phase candidates from listMetas entries.
 *
 * Derives phase state and auto-retries failed phases for each entry.
 * Used by orchestratePhase, queue route, and status route.
 */
export function buildPhaseCandidates(
  entries: MetaEntry[],
): PhaseCandidateInput[] {
  return entries.map((entry) => ({
    node: entry.node,
    meta: entry.meta,
    phaseState: retryAllFailed(derivePhaseState(entry.meta)),
    actualStaleness: entry.stalenessSeconds,
    locked: entry.locked,
    disabled: entry.disabled,
  }));
}

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
 * Rank all eligible phase candidates by priority.
 *
 * Filters to pending phases, computes effective staleness, and sorts by
 * band (ascending: critic first) then effective staleness (descending).
 *
 * Used by selectPhaseCandidate (returns first) and the queue route (returns all).
 */
export function rankPhaseCandidates(
  metas: PhaseCandidateInput[],
  depthWeight: number,
): PhaseCandidate[] {
  // Filter to metas with a pending (scheduler-eligible) phase
  const eligible = metas.filter((m) => {
    if (m.locked) return false;
    if (m.disabled && !m.isOverride) return false;

    const owed = getOwedPhase(m.phaseState);
    if (!owed) return false;

    return m.phaseState[owed] === 'pending';
  });

  if (eligible.length === 0) return [];

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

  return candidates;
}

/**
 * Select the best phase candidate across the corpus.
 *
 * @param metas - Array of (node, meta, phaseState, stalenessSeconds) tuples.
 * @param depthWeight - Config depthWeight for staleness tiebreak.
 * @returns The winning candidate, or null if no phase is ready.
 */
export function selectPhaseCandidate(
  metas: PhaseCandidateInput[],
  depthWeight: number,
): PhaseCandidate | null {
  return rankPhaseCandidates(metas, depthWeight)[0] ?? null;
}
