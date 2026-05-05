/**
 * In-memory cache for listMetas results with TTL and concurrent refresh guard.
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
