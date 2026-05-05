/**
 * Scheduling module — staleness detection and candidate selection.
 *
 * @module scheduling
 */

export {
  actualStaleness,
  computeStalenessScore,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
  MAX_STALENESS_SECONDS,
} from './staleness.js';
export {
  computeEffectiveStaleness,
  type StalenessCandidate,
} from './weightedFormula.js';
