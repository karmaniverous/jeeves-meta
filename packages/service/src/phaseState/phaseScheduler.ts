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
  isFullyFresh,
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
 * Resolve the schedulable phase state of a meta from meta.json alone.
 *
 * Derives phase state, auto-retries failed phases, and applies Tier 1
 * cheap invalidation (no I/O): a meta with persisted, fully-fresh
 * _phaseState owes an architect phase when it has no _builder or its
 * _synthesisCount has reached architectEvery.
 *
 * The scheduler (selection) and the queue processor (execution) must both
 * use this function, so that a meta selected for a phase runs that phase
 * (#249).
 *
 * @param meta - The meta.json content.
 * @param architectEvery - Config: run architect every N cycles.
 * @returns The phase state to schedule and execute against.
 */
export function resolvePhaseState(
  meta: MetaJson,
  architectEvery: number,
): PhaseState {
  const ps = retryAllFailed(derivePhaseState(meta));

  if (!meta._phaseState || !isFullyFresh(ps)) return ps;

  const needsArchitect =
    !meta._builder || (meta._synthesisCount ?? 0) >= architectEvery;

  return needsArchitect
    ? { architect: 'pending', builder: 'stale', critic: 'stale' }
    : ps;
}

/**
 * Build phase candidates from listMetas entries.
 *
 * Resolves each meta's phase state via {@link resolvePhaseState}.
 * Used by the scheduler and the queue, status, preview and synthesize routes.
 */
export function buildPhaseCandidates(
  entries: MetaEntry[],
  architectEvery: number,
): PhaseCandidateInput[] {
  return entries.map((entry) => {
    return {
      node: entry.node,
      meta: entry.meta,
      phaseState: resolvePhaseState(entry.meta, architectEvery),
      actualStaleness: entry.stalenessSeconds,
      locked: entry.locked,
      disabled: entry.disabled,
    };
  });
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

/** Result of Tier 2 candidate selection. */
export interface Tier2Candidate {
  node: MetaNode;
  meta: MetaJson;
}

/**
 * Select the stalest all-fresh, non-disabled, non-locked meta for Tier 2
 * invalidation. These are metas that Tier 1 considers fully fresh but may
 * have structural or steer changes detectable only via I/O.
 *
 * @param metas - Phase candidate inputs (after Tier 1 filtering).
 * @returns The stalest all-fresh candidate, or null if none exist.
 */
export function selectTier2Candidate(
  metas: PhaseCandidateInput[],
): Tier2Candidate | null {
  const eligible = metas
    .filter((m) => !m.locked && !m.disabled && isFullyFresh(m.phaseState))
    .sort((a, b) => b.actualStaleness - a.actualStaleness);

  if (eligible.length === 0) return null;

  return { node: eligible[0].node, meta: eligible[0].meta };
}

/**
 * Select all fully-fresh, non-disabled, non-locked metas sorted by staleness
 * (descending — stalest first) for Tier 2 invalidation scanning.
 */
export function selectAllTier2Candidates(
  metas: PhaseCandidateInput[],
): Tier2Candidate[] {
  return metas
    .filter((m) => !m.locked && !m.disabled && isFullyFresh(m.phaseState))
    .sort((a, b) => b.actualStaleness - a.actualStaleness)
    .map((m) => ({ node: m.node, meta: m.meta }));
}
