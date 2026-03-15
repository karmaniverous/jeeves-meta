/**
 * Periodic watcher health check for rule registration resilience.
 *
 * Pings watcher `/status` on a configurable interval, detects restarts
 * (uptime decrease), and re-registers virtual rules automatically.
 * Independent of the synthesis scheduler.
 *
 * @module rules/healthCheck
 */

import type { Logger } from 'pino';

import type { RuleRegistrar } from './index.js';

interface WatcherStatusResponse {
  status: string;
  uptime: number;
}

/**
 * Manages the periodic watcher health check loop.
 *
 * Starts a `setInterval` that pings the watcher and delegates
 * restart detection to `RuleRegistrar.checkAndReregister()`.
 */
export class WatcherHealthCheck {
  private readonly watcherUrl: string;
  private readonly intervalMs: number;
  private readonly registrar: RuleRegistrar;
  private readonly logger: Logger;
  private handle: ReturnType<typeof setInterval> | null = null;

  public constructor(opts: {
    watcherUrl: string;
    intervalMs: number;
    registrar: RuleRegistrar;
    logger: Logger;
  }) {
    this.watcherUrl = opts.watcherUrl.replace(/\/+$/, '');
    this.intervalMs = opts.intervalMs;
    this.registrar = opts.registrar;
    this.logger = opts.logger;
  }

  /** Start the periodic health check. No-op if intervalMs is 0. */
  public start(): void {
    if (this.intervalMs <= 0) {
      this.logger.info('Watcher health check disabled (interval = 0)');
      return;
    }

    this.handle = setInterval(() => {
      void this.check();
    }, this.intervalMs);

    // Don't prevent process exit
    if (typeof this.handle === 'object' && 'unref' in this.handle) {
      this.handle.unref();
    }

    this.logger.info(
      { intervalMs: this.intervalMs },
      'Watcher health check started',
    );
  }

  /** Stop the periodic health check. */
  public stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  /** Single health check iteration. */
  private async check(): Promise<void> {
    try {
      const res = await fetch(this.watcherUrl + '/status', {
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        this.logger.warn(
          { status: res.status },
          'Watcher health check: non-OK response',
        );
        return;
      }

      const data = (await res.json()) as WatcherStatusResponse;
      await this.registrar.checkAndReregister(data.uptime);
    } catch (err) {
      this.logger.debug(
        { err },
        'Watcher health check: unreachable (expected during startup)',
      );
    }
  }
}
