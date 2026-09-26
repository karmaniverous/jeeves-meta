/**
 * Phase-state machine module.
 *
 * @module phaseState
 */

export { derivePhaseState } from './derivePhaseState.js';
export { computeInvalidation } from './invalidate.js';
export {
  buildPhaseCandidates,
  type PhaseCandidateInput,
  rankPhaseCandidates,
  selectAllTier2Candidates,
  selectPhaseCandidate,
} from './phaseScheduler.js';
export {
  architectSuccess,
  builderSuccess,
  criticSuccess,
  freshPhaseState,
  getOwedPhase,
  getPriorityBand,
  isFullyFresh,
  phaseFailed,
  phaseRunning,
  retryAllFailed,
} from './phaseTransitions.js';
