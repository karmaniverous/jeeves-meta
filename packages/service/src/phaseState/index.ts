/**
 * Phase-state machine module.
 *
 * @module phaseState
 */

export { type DerivationInputs, derivePhaseState } from './derivePhaseState.js';
export {
  type ArchitectInvalidator,
  computeInvalidation,
  type InvalidationResult,
  type StalenessInputs,
} from './invalidate.js';
export {
  buildPhaseCandidates,
  type PhaseCandidate,
  type PhaseCandidateInput,
  rankPhaseCandidates,
  selectPhaseCandidate,
} from './phaseScheduler.js';
export {
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
