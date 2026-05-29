/**
 * Croner-based scheduler that discovers the highest-priority ready phase
 * across the corpus each tick and enqueues it for execution.
 *
 * @module scheduler
 */

import { Cron } from 'croner';
import type { Logger } from 'pino';

import type { MetaCache } from '../cache.js';
import { getScopeFiles } from '../discovery/scope.js';
import { acquireLock, releaseLock } from '../lock.js';
import { persistPhaseState } from '../orchestrator/runPhase.js';
import {
  buildPhaseCandidates,
  computeInvalidation,
  getOwedPhase,
  getPriorityBand,
  type PhaseCandidateInput,
  selectAllTier2Candidates,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import type { SynthesisQueue } from '../queue/index.js';
import { readMetaJson } from '../readMetaJson.js';
import type { RuleRegistrar } from '../rules/index.js';
import type { ServiceConfig } from '../schema/config.js';
import { autoSeedPass } from '../seed/index.js';
import type { HttpWatcherClient } from '../watcher-client/index.js';

const MAX_BACKOFF_MULTIPLIER = 4;

/** Result of a scheduler tick's candidate discovery. */
export interface TickCandidate {
  path: string;
  phase: 'architect' | 'builder' | 'critic';
  band: number;
}

/**
 * Periodic scheduler that discovers the highest-priority ready phase
 * across all metas and enqueues it for execution.
 *
 * Supports adaptive backoff when no candidates are found and hot-reloadable
 * cron expressions via {@link Scheduler.updateSchedule}.
 */
export class Scheduler {
  private job: Cron | null = null;
  private backoffMultiplier = 1;
  private tickCount = 0;
  private readonly config: ServiceConfig;
  private readonly queue: SynthesisQueue;
  private readonly logger: Logger;
  private readonly watcher: HttpWatcherClient;
  private readonly cache: MetaCache;
  private registrar: RuleRegistrar | null = null;
  private currentExpression: string;

  constructor(
    config: ServiceConfig,
    queue: SynthesisQueue,
    logger: Logger,
    watcher: HttpWatcherClient,
    cache: MetaCache,
  ) {
    this.config = config;
    this.queue = queue;
    this.logger = logger;
    this.watcher = watcher;
    this.cache = cache;
    this.currentExpression = config.schedule;
  }

  /** Set the rule registrar for watcher restart detection. */
  setRegistrar(registrar: RuleRegistrar): void {
    this.registrar = registrar;
  }

  /** Start the cron job. */
  start(): void {
    if (this.job) return;

    this.job = new Cron(this.currentExpression, () => {
      void this.tick();
    });

    this.logger.info({ schedule: this.currentExpression }, 'Scheduler started');
  }

  /** Stop the cron job. */
  stop(): void {
    if (!this.job) return;

    this.job.stop();
    this.job = null;
    this.backoffMultiplier = 1;

    this.logger.info('Scheduler stopped');
  }

  /** Hot-reload the cron schedule expression. */
  updateSchedule(expression: string): void {
    this.currentExpression = expression;

    if (this.job) {
      this.job.stop();
      this.job = new Cron(expression, () => {
        void this.tick();
      });

      this.logger.info({ schedule: expression }, 'Schedule updated');
    }
  }

  /** Reset backoff multiplier (call after successful phase execution). */
  resetBackoff(): void {
    if (this.backoffMultiplier > 1) {
      this.logger.debug('Backoff reset after successful phase execution');
    }
    this.backoffMultiplier = 1;
  }

  /** Whether the scheduler is currently running. */
  get isRunning(): boolean {
    return this.job !== null;
  }

  /** Next scheduled tick time, or null if not running. */
  get nextRunAt(): Date | null {
    if (!this.job) return null;
    return this.job.nextRun() ?? null;
  }

  /**
   * Single tick: discover the highest-priority ready phase and enqueue it.
   *
   * Applies adaptive backoff when no candidates are found.
   */
  private async tick(): Promise<void> {
    this.tickCount++;

    // Apply backoff: skip ticks when backing off
    if (
      this.backoffMultiplier > 1 &&
      this.tickCount % this.backoffMultiplier !== 0
    ) {
      this.logger.trace(
        {
          backoffMultiplier: this.backoffMultiplier,
          tickCount: this.tickCount,
        },
        'Skipping tick (backoff)',
      );
      return;
    }

    // Auto-seed pass: create .meta/ for matching directories
    if (this.config.autoSeed.length > 0) {
      try {
        const result = await autoSeedPass(
          this.config.autoSeed,
          this.watcher,
          this.logger,
        );
        if (result.seeded > 0) {
          this.logger.info(
            { seeded: result.seeded },
            'Auto-seed pass completed',
          );
        }
      } catch (err) {
        this.logger.warn({ err }, 'Auto-seed pass failed');
      }
    }

    const candidate = await this.discoverNextPhase();

    if (!candidate) {
      this.backoffMultiplier = Math.min(
        this.backoffMultiplier * 2,
        MAX_BACKOFF_MULTIPLIER,
      );
      this.logger.debug(
        { backoffMultiplier: this.backoffMultiplier },
        'No ready phases found, increasing backoff',
      );
      return;
    }

    // Enqueue using the legacy queue path (backward compat with processQueue)
    this.queue.enqueue(candidate.path);
    this.logger.info(
      { path: candidate.path, phase: candidate.phase, band: candidate.band },
      'Enqueued phase candidate',
    );

    // Opportunistic watcher restart detection
    if (this.registrar) {
      try {
        const statusRes = await fetch(
          new URL('/status', this.config.watcherUrl),
          {
            signal: AbortSignal.timeout(3000),
          },
        );
        if (statusRes.ok) {
          const status = (await statusRes.json()) as { uptime?: number };
          if (typeof status.uptime === 'number') {
            await this.registrar.checkAndReregister(status.uptime);
          }
        }
      } catch {
        // Watcher unreachable — skip uptime check
      }
    }
  }

  /**
   * Discover the highest-priority ready phase across the corpus.
   *
   * Uses phase-state-aware scheduling: priority order is
   * critic (band 1) \> builder (band 2) \> architect (band 3),
   * with weighted staleness as tiebreaker within a band.
   */
  private async discoverNextPhase(): Promise<TickCandidate | null> {
    try {
      const result = await this.cache.get(this.config, this.watcher);

      const candidates = buildPhaseCandidates(
        result.entries,
        this.config.architectEvery,
      );

      const winner = selectPhaseCandidate(candidates, this.config.depthWeight);

      if (!winner) return await this.discoverTier2Phase(candidates);

      return {
        path: winner.node.metaPath,
        phase: winner.owedPhase,
        band: winner.band,
      };
    } catch (err) {
      this.logger.warn({ err }, 'Failed to discover next phase candidate');
      return null;
    }
  }

  /**
   * Tier 2 invalidation: iterate all-fresh candidates (stalest first),
   * run computeInvalidation, and return the first that produces an owed phase.
   */
  private async discoverTier2Phase(
    candidates: PhaseCandidateInput[],
  ): Promise<TickCandidate | null> {
    const allTier2 = selectAllTier2Candidates(candidates);

    const limit = this.config.tier2ScanLimit;
    const tier2Candidates = allTier2.slice(0, limit);

    if (allTier2.length > limit) {
      this.logger.debug(
        { total: allTier2.length, limit },
        'Tier 2 scan limit reached, scanning subset',
      );
    }

    let dirty = false;

    for (const t2 of tier2Candidates) {
      if (!acquireLock(t2.node.metaPath)) continue;

      try {
        const currentMeta = await readMetaJson(t2.node.metaPath);
        const { scopeFiles } = await getScopeFiles(t2.node, this.watcher);

        const result = await computeInvalidation(
          currentMeta,
          scopeFiles,
          this.config,
          t2.node,
        );

        const owedPhase = getOwedPhase(result.phaseState);

        if (owedPhase) {
          await persistPhaseState(
            {
              metaPath: t2.node.metaPath,
              current: currentMeta,
              config: this.config,
              structureHash: result.inputStatus.structureHash,
            },
            result.phaseState,
            {},
          );
          this.cache.invalidate();

          return {
            path: t2.node.metaPath,
            phase: owedPhase,
            band: getPriorityBand(result.phaseState)!,
          };
        }

        // No invalidation — bump _generatedAt to delay re-checking
        await persistPhaseState(
          {
            metaPath: t2.node.metaPath,
            current: currentMeta,
            config: this.config,
            structureHash: result.inputStatus.structureHash,
          },
          result.phaseState,
          {
            _generatedAt: new Date().toISOString(),
          },
        );
        dirty = true;
      } finally {
        releaseLock(t2.node.metaPath);
      }
    }

    if (dirty) this.cache.invalidate();

    return null;
  }
}
