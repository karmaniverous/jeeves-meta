/**
 * In-memory cache for listMetas results with TTL, concurrent refresh guard
 * and a non-blocking read (`peek`) for health checks.
 *
 * @module cache
 */

import { listMetas, type MetaListResult } from './discovery/index.js';
import type { WatcherClient } from './interfaces/index.js';
import type { ServiceConfig } from './schema/config.js';

const TTL_MS = 60_000;

/**
 * Caches listMetas results to avoid expensive repeated filesystem walks.
 * Supports concurrent refresh coalescing and manual invalidation.
 */
export class MetaCache {
  private result: MetaListResult | null = null;
  private updatedAt = 0;
  private refreshPromise: Promise<MetaListResult> | null = null;

  /** Get cached result or refresh if stale. */
  async get(
    config: ServiceConfig,
    watcher: WatcherClient,
  ): Promise<MetaListResult> {
    if (this.result && Date.now() - this.updatedAt < TTL_MS) {
      return this.result;
    }
    return this.refresh(config, watcher);
  }

  /**
   * The cached result without waiting on a stale one: when it has expired,
   * return it anyway and refresh in the background. Only the first load,
   * with nothing cached yet, is awaited. For callers that must answer fast
   * (`GET /status`), where a 60 s-old list is good enough.
   */
  async peek(
    config: ServiceConfig,
    watcher: WatcherClient,
  ): Promise<MetaListResult> {
    if (!this.result) return this.refresh(config, watcher);
    if (Date.now() - this.updatedAt >= TTL_MS) {
      // A failed background refresh keeps the old result; the next caller
      // retries it.
      this.refresh(config, watcher).catch(() => undefined);
    }
    return this.result;
  }

  /** Force-expire the cache so next get() triggers a refresh. */
  invalidate(): void {
    this.updatedAt = 0;
  }

  private async refresh(
    config: ServiceConfig,
    watcher: WatcherClient,
  ): Promise<MetaListResult> {
    if (this.refreshPromise) return this.refreshPromise;

    this.refreshPromise = listMetas(config, watcher)
      .then((result) => {
        this.result = result;
        this.updatedAt = Date.now();
        return result;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }
}
