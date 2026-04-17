/**
 * Orchestrator module — the main synthesis cycle.
 *
 * @module orchestrator
 */

export {
  buildArchitectTask,
  buildBuilderTask,
  buildCriticTask,
} from './buildTask.js';
export { buildContextPackage } from './contextPackage.js';
export { mergeAndWrite, type MergeOptions } from './merge.js';
export {
  orchestrate,
  type OrchestrateResult,
  type ProgressCallback,
} from './orchestrate.js';
export {
  orchestratePhase,
  type OrchestratePhaseResult,
  type PhaseProgressCallback,
} from './orchestratePhase.js';
export {
  type BuilderOutput,
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
} from './parseOutput.js';
export {
  type PhaseResult,
  runArchitect,
  runBuilder,
  runCritic,
} from './runPhase.js';
