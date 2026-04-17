/**
 * Croner-based scheduler that discovers the highest-priority ready phase
 * across the corpus each tick and enqueues it for execution.
 *
 * @module scheduler
 */

import { Cron } from 'croner';
import type { Logger } from 'pino';

import { listMetas } from '../discovery/index.js';
import {
  buildPhaseCandidates,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import type { SynthesisQueue } from '../queue/index.js';
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
  private registrar: RuleRegistrar | null = null;
  private currentExpression: string;

  constructor(
    config: ServiceConfig,
    queue: SynthesisQueue,
    logger: Logger,
    watcher: HttpWatcherClient,
  ) {
    this.config = config;
    this.queue = queue;
    this.logger = logger;
    this.watcher = watcher;
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
      const result = await listMetas(this.config, this.watcher);

      const candidates = buildPhaseCandidates(result.entries);

      const winner = selectPhaseCandidate(candidates, this.config.depthWeight);

      if (!winner) return null;

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
}
