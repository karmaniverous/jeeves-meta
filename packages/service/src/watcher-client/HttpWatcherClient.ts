/**
 * HTTP implementation of the WatcherClient interface.
 *
 * Talks to jeeves-watcher's POST /walk and POST /rules/register endpoints
 * with retry and exponential backoff.
 *
 * @module watcher-client/HttpWatcherClient
 */

import { sleepAsync } from '@karmaniverous/jeeves';

import type {
  InferenceRuleSpec,
  WatcherClient,
  WatcherScanRequest,
  WatcherScanResult,
} from '../interfaces/index.js';

/** Default retry configuration. */
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;
const DEFAULT_BACKOFF_FACTOR = 4;
const DEFAULT_TIMEOUT_MS = 30_000;

/** Options for creating an HttpWatcherClient. */
export interface HttpWatcherClientOptions {
  /** Base URL for the watcher service (e.g. "http://localhost:1936"). */
  baseUrl: string;
  /** Maximum retry attempts for transient failures. Default: 3. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff. Default: 1000. */
  backoffBaseMs?: number;
  /** Multiplier for backoff. Default: 4 (1s, 4s, 16s). */
  backoffFactor?: number;
  /** Per-request timeout in ms. Default: 10000. */
  timeoutMs?: number;
}

/** Check if an error is transient (worth retrying). */
function isTransient(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

/**
 * HTTP-based WatcherClient implementation with retry.
 */
export class HttpWatcherClient implements WatcherClient {
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffFactor: number;
  private readonly timeoutMs: number;

  constructor(options: HttpWatcherClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffFactor = options.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** POST JSON with retry. */
  private async post(endpoint: string, body: unknown): Promise<unknown> {
    const url = this.baseUrl + endpoint;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.ok) {
        return res.json();
      }

      if (!isTransient(res.status) || attempt === this.maxRetries) {
        const text = await res.text();
        throw new Error(
          `Watcher ${endpoint} failed: HTTP ${res.status.toString()} - ${text}`,
        );
      }

      // Exponential backoff
      const delayMs =
        this.backoffBaseMs * Math.pow(this.backoffFactor, attempt);
      await sleepAsync(delayMs);
    }

    // Unreachable, but TypeScript needs it
    throw new Error('Retry exhausted');
  }

  async registerRules(
    source: string,
    rules: InferenceRuleSpec[],
  ): Promise<void> {
    await this.post('/rules/register', { source, rules });
  }

  async walk(globs: string[]): Promise<string[]> {
    const raw = (await this.post('/walk', { globs })) as Record<
      string,
      unknown
    >;
    return (raw.paths ?? []) as string[];
  }

  async scan(request: WatcherScanRequest): Promise<WatcherScanResult> {
    const raw = (await this.post('/scan', request)) as Record<string, unknown>;
    return {
      points: ((raw.points ?? []) as WatcherScanResult['points']).map(
        (point) => ({
          id: point.id,
          payload: point.payload ?? {},
        }),
      ),
      cursor:
        typeof raw.cursor === 'string' || raw.cursor === null
          ? raw.cursor
          : null,
    };
  }
}
