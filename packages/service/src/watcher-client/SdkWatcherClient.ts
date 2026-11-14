/**
 * The service's {@link WatcherClient}, built on `@karmaniverous/jeeves-watcher-sdk`
 * (spec 4.4.8, Decision 189): `registerRules`, `walk` and `scan` through the
 * SDK, wrapped in meta's own retry policy, and a typed `/status` probe.
 * Network I/O only.
 *
 * @module watcher-client/SdkWatcherClient
 */

import { sleepAsync } from '@karmaniverous/jeeves';
import {
  createWatcherClient,
  type FetchLike,
  isWatcherError,
  type WatcherClient as SdkClient,
} from '@karmaniverous/jeeves-watcher-sdk';

import type {
  InferenceRuleSpec,
  WatcherClient,
  WatcherScanRequest,
  WatcherScanResult,
} from '../interfaces/index.js';

/** Per-call timeout for data calls (ms); unchanged from 0.19.0. */
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_FACTOR = 4;

/** Options for {@link SdkWatcherClient}. */
export interface SdkWatcherClientOptions {
  /** Watcher base URL (e.g. "http://localhost:1936"). */
  baseUrl: string;
  /** Retries after the first attempt on a transient failure. Default: 3. */
  maxRetries?: number;
  /** First backoff delay (ms). Default: 1000. */
  backoffBaseMs?: number;
  /** Backoff multiplier. Default: 4 (1 s, 4 s, 16 s). */
  backoffFactor?: number;
  /** Per-call timeout (ms). Default: 30000. */
  timeoutMs?: number;
  /** `fetch` implementation (tests). Default: global `fetch`. */
  fetch?: FetchLike;
}

/** What a `/status` probe found. */
export interface WatcherProbe {
  /** `unreachable`: no response; `error`: a non-2xx or unparseable reply. */
  status: 'ok' | 'indexing' | 'error' | 'unreachable';
  /** Watcher uptime (s), when it answered. */
  uptime?: number;
  /** Whether the watcher's initial scan is running (#244). */
  indexing: boolean;
}

/**
 * Whether a failed call is worth retrying: an HTTP 5xx, 408 or 429. Network
 * errors and timeouts are not retried, as in 0.19.0.
 *
 * @param error - The SDK error.
 * @returns True when transient.
 */
function isTransient(error: unknown): boolean {
  const status = isWatcherError(error) ? error.status : undefined;
  return (
    status !== undefined && (status >= 500 || status === 408 || status === 429)
  );
}

/**
 * Probe the watcher's `GET /status` once (no retries).
 *
 * @param baseUrl - Watcher base URL.
 * @param timeoutMs - Probe timeout (ms).
 * @param fetchImpl - Optional `fetch` (tests).
 * @returns The probe result; never throws.
 */
export async function probeWatcher(
  baseUrl: string,
  timeoutMs: number,
  fetchImpl?: FetchLike,
): Promise<WatcherProbe> {
  try {
    const client = createWatcherClient({
      baseUrl,
      timeoutMs,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
    const res = await client.status();
    const indexing = res.health.initialScan?.active === true;
    return {
      status: indexing ? 'indexing' : 'ok',
      uptime: res.uptime,
      indexing,
    };
  } catch (error) {
    const answered = isWatcherError(error) && error.status !== undefined;
    return { status: answered ? 'error' : 'unreachable', indexing: false };
  }
}

/** HTTP watcher client for the service, with retry. */
export class SdkWatcherClient implements WatcherClient {
  private readonly sdk: SdkClient;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffFactor: number;

  public constructor(options: SdkWatcherClientOptions) {
    this.sdk = createWatcherClient({
      baseUrl: options.baseUrl,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
  }

  /**
   * Run `call`, retrying transient failures with exponential backoff.
   *
   * @param endpoint - Watcher path, for the error message.
   * @param call - The SDK call.
   * @returns The call's result.
   */
  private async withRetry<T>(
    endpoint: string,
    call: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await call();
      } catch (error) {
        if (!isTransient(error) || attempt >= this.maxRetries) {
          const status = isWatcherError(error) ? (error.status ?? 0) : 0;
          if (status >= 400)
            throw new Error(
              `Watcher ${endpoint} failed: HTTP ${status.toString()} - ${(error as Error).message}`,
              { cause: error },
            );
          throw error;
        }
        await sleepAsync(
          this.backoffBaseMs * Math.pow(this.backoffFactor, attempt),
        );
      }
    }
  }

  public async registerRules(
    source: string,
    rules: InferenceRuleSpec[],
  ): Promise<void> {
    await this.withRetry('/rules/register', () =>
      this.sdk.registerRules({
        source,
        rules: rules.map((rule) => ({ ...rule })),
      }),
    );
  }

  public async walk(globs: string[]): Promise<string[]> {
    const res = await this.withRetry('/walk', () => this.sdk.walk({ globs }));
    return res.paths;
  }

  public async scan(request: WatcherScanRequest): Promise<WatcherScanResult> {
    const res = await this.withRetry('/scan', () =>
      this.sdk.scan(request as Parameters<SdkClient['scan']>[0]),
    );
    if (!('points' in res)) return { points: [], cursor: null };
    return {
      points: res.points.map((point) => ({
        id: point.id,
        payload: point.payload,
      })),
      cursor: typeof res.cursor === 'string' ? res.cursor : null,
    };
  }
}
