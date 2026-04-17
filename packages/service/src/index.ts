/**
 * Jeeves Meta Service — knowledge synthesis HTTP service for the Jeeves platform.
 *
 * @packageDocumentation
 */

// ── Archive ──
export {
  createSnapshot,
  listArchiveFiles,
  pruneArchive,
  readLatestArchive,
} from './archive/index.js';

// ── Constants ──
export {
  DEFAULT_PORT,
  DEFAULT_PORT_STR,
  SERVICE_NAME,
  SERVICE_VERSION,
} from './constants.js';

// ── Custom CLI Commands ──
export { registerCustomCliCommands } from './customCliCommands.js';

// ── Descriptor ──
export { metaDescriptor, RESTART_REQUIRED_FIELDS } from './descriptor.js';

// ── Config ──
export {
  loadServiceConfig,
  migrateConfigPath,
  resolveConfigPath,
} from './configLoader.js';

// ── Discovery ──
export {
  buildOwnershipTree,
  discoverMetas,
  filterInScope,
  findNode,
  getScopePrefix,
  listMetas,
  type MetaEntry,
  type MetaListResult,
  type MetaListSummary,
  type MetaNode,
  type OwnershipTree,
} from './discovery/index.js';

// ── Utilities ──
export { computeEma } from './ema.js';
export { toMetaError } from './errors.js';
export {
  acquireLock,
  cleanupStaleLocks,
  isLocked,
  type LockState,
  readLockState,
  releaseLock,
  resolveMetaDir,
} from './lock.js';
export { normalizePath } from './normalizePath.js';
export { computeStructureHash } from './structureHash.js';

// ── Executor ──
export {
  GatewayExecutor,
  type GatewayExecutorOptions,
} from './executor/index.js';

// ── Interfaces ──
export type {
  InferenceRuleSpec,
  MetaContext,
  MetaExecutor,
  MetaSpawnOptions,
  MetaSpawnResult,
  WatcherClient,
  WatcherScanPoint,
  WatcherScanRequest,
  WatcherScanResult,
} from './interfaces/index.js';

// ── Logger ──
export type { LoggerConfig } from './logger/index.js';
export { createLogger, type MinimalLogger } from './logger/index.js';

// ── Orchestrator ──
export {
  buildArchitectTask,
  buildBuilderTask,
  buildContextPackage,
  buildCriticTask,
  type BuilderOutput,
  mergeAndWrite,
  type MergeOptions,
  orchestrate,
  orchestratePhase,
  type OrchestratePhaseResult,
  type OrchestrateResult,
  parseArchitectOutput,
  parseBuilderOutput,
  parseCriticOutput,
  type PhaseProgressCallback,
  type PhaseResult,
  type ProgressCallback,
  runArchitect,
  runBuilder,
  runCritic,
} from './orchestrator/index.js';

// ── Progress ──
export {
  formatProgressEvent,
  type ProgressEvent,
  type ProgressPhase,
  ProgressReporter,
  type ProgressReporterConfig,
} from './progress/index.js';

// ── Scheduling ──
export {
  actualStaleness,
  computeEffectiveStaleness,
  hasSteerChanged,
  isArchitectTriggered,
  isStale,
  MAX_STALENESS_SECONDS,
  selectCandidate,
  type StalenessCandidate,
} from './scheduling/index.js';

// ── Schema ──
export {
  type MetaConfig,
  metaConfigSchema,
  type MetaError,
  metaErrorSchema,
  type MetaJson,
  metaJsonSchema,
  type ServiceConfig,
  serviceConfigSchema,
} from './schema/index.js';

// ── Scheduler ──
export { Scheduler } from './scheduler/index.js';

// ── Queue ──
export {
  type EnqueueResult,
  type QueueItem,
  type QueueState,
  SynthesisQueue,
} from './queue/index.js';

// ── Routes ──
export {
  registerRoutes,
  type RouteDeps,
  type ServiceStats,
} from './routes/index.js';

// ── Rules ──
export { RuleRegistrar } from './rules/index.js';
export { verifyRuleApplication } from './rules/verify.js';

// ── Sleep ──
export { sleepAsync as sleep } from '@karmaniverous/jeeves';

// ── Server ──
export type { ServerOptions } from './server.js';
export { createServer } from './server.js';

// ── Shutdown ──
export { registerShutdownHandlers } from './shutdown/index.js';

// ── Watcher Client ──
export {
  HttpWatcherClient,
  type HttpWatcherClientOptions,
} from './watcher-client/index.js';

// ── Service Bootstrap ──
export { startService } from './bootstrap.js';
