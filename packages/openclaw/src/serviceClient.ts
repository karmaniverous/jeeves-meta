/**
 * Thin HTTP client for the jeeves-meta service.
 *
 * Plugin delegates all operations to the running service via HTTP.
 * Shared response types are imported from `@karmaniverous/jeeves-meta-core`.
 *
 * @module serviceClient
 */

import { fetchJson, postJson } from '@karmaniverous/jeeves';
import {
  type DepHealth,
  type EndpointName,
  type GatewayDepHealth,
  getEndpoint,
  type MetaListSummary,
  type MetasItem,
  type MetasResponse,
  type ServiceState,
  type WatcherDepHealth,
} from '@karmaniverous/jeeves-meta-core';

// Re-export core types for consumers that import from this module.
export type {
  DepHealth,
  GatewayDepHealth,
  MetaListSummary,
  MetasItem,
  MetasResponse,
  ServiceState,
  WatcherDepHealth,
};

/**
 * Service status response from GET /status.
 *
 * The jeeves-core `createStatusHandler` wraps `getHealth()` output under
 * a top-level `health` key. Dependency info lives at `health.dependencies`.
 */
export interface StatusResponse {
  /** Service name. */
  name: string;
  /** Service uptime in seconds. */
  uptime: number;
  /** Overall status (healthy, degraded, unhealthy). */
  status: string;
  /** Service version. */
  version?: string;
  /** Component-specific health details from getHealth(). */
  health: {
    /** Service-specific lifecycle state. */
    serviceState?: ServiceState;
    dependencies: {
      watcher: WatcherDepHealth;
      gateway: GatewayDepHealth;
    };
    [key: string]: unknown;
  };
}

/** Constructor config. */
interface MetaServiceConfig {
  /** Base URL of the jeeves-meta service (e.g. http://127.0.0.1:1938). */
  apiUrl: string;
}

export class MetaServiceClient {
  private readonly baseUrl: string;

  public constructor(config: MetaServiceConfig) {
    this.baseUrl = config.apiUrl.replace(/\/$/, '');
  }

  /** Return the base URL (for error reporting). */
  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /** GET helper — returns parsed JSON. */
  private async get<T = unknown>(path: string): Promise<T> {
    return fetchJson(this.baseUrl + path) as Promise<T>;
  }

  /** POST helper — returns parsed JSON. */
  private async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return postJson(this.baseUrl + path, body) as Promise<T>;
  }

  /**
   * Interpolate a parameterized endpoint path.
   * Replaces `:param` placeholders with URI-encoded values.
   */
  private endpointPath(
    name: EndpointName,
    params?: Record<string, string>,
  ): string {
    let p: string = getEndpoint(name).path;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        p = p.replace(`:${key}`, encodeURIComponent(value));
      }
    }
    return p;
  }

  /** GET /status — service health + queue state. */
  public async status(): Promise<StatusResponse> {
    return this.get<StatusResponse>(this.endpointPath('status'));
  }

  /** GET /metas — list all meta entities with summary. */
  public async listMetas(params?: {
    pathPrefix?: string;
    hasError?: boolean;
    staleHours?: number;
    neverSynthesized?: boolean;
    locked?: boolean;
    disabled?: boolean;
    fields?: string[];
  }): Promise<MetasResponse> {
    const qs = new URLSearchParams();
    if (params?.pathPrefix) qs.set('pathPrefix', params.pathPrefix);
    if (params?.hasError !== undefined)
      qs.set('hasError', String(params.hasError));
    if (params?.staleHours !== undefined)
      qs.set('staleHours', String(params.staleHours));
    if (params?.neverSynthesized !== undefined)
      qs.set('neverSynthesized', String(params.neverSynthesized));
    if (params?.locked !== undefined) qs.set('locked', String(params.locked));
    if (params?.disabled !== undefined)
      qs.set('disabled', String(params.disabled));
    if (params?.fields?.length) qs.set('fields', params.fields.join(','));
    const query = qs.toString();
    return this.get<MetasResponse>(
      this.endpointPath('listMetas') + (query ? '?' + query : ''),
    );
  }

  /** PATCH /metas/:path — update user-settable reserved properties. */
  public async update(
    metaPath: string,
    updates: {
      _steer?: string | null;
      _emphasis?: number | null;
      _depth?: number | null;
      _crossRefs?: string[] | null;
      _disabled?: boolean | null;
      _architectTimeout?: number | null;
      _builderTimeout?: number | null;
      _criticTimeout?: number | null;
    },
  ): Promise<unknown> {
    return fetchJson(
      `${this.baseUrl}${this.endpointPath('updateMeta', { path: metaPath })}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      },
    );
  }

  /** GET /metas/:path — detail for a single meta. */
  public async detail(
    metaPath: string,
    options?: { includeArchive?: boolean | number; fields?: string[] },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (options?.includeArchive !== undefined)
      qs.set('includeArchive', String(options.includeArchive));
    if (options?.fields?.length) qs.set('fields', options.fields.join(','));
    const query = qs.toString();
    return this.get(
      this.endpointPath('metaDetail', { path: metaPath }) +
        (query ? '?' + query : ''),
    );
  }

  /** GET /preview — dry-run next synthesis candidate. */
  public async preview(path?: string): Promise<unknown> {
    const qs = path ? '?path=' + encodeURIComponent(path) : '';
    return this.get(this.endpointPath('preview') + qs);
  }

  /** POST /synthesize — enqueue synthesis. */
  public async synthesize(path?: string): Promise<unknown> {
    return this.post(this.endpointPath('synthesize'), path ? { path } : {});
  }

  /** POST /seed — create .meta/ for a path. */
  public async seed(
    path: string,
    crossRefs?: string[],
    steer?: string,
  ): Promise<unknown> {
    const body: Record<string, unknown> = { path };
    if (crossRefs !== undefined) body.crossRefs = crossRefs;
    if (steer !== undefined) body.steer = steer;
    return this.post(this.endpointPath('seed'), body);
  }

  /** POST /unlock — remove .lock from a meta entity. */
  public async unlock(path: string): Promise<unknown> {
    return this.post(this.endpointPath('unlock'), { path });
  }

  /** GET /config — query service config with optional JSONPath. */
  public async config(path?: string): Promise<unknown> {
    const qs = path ? '?path=' + encodeURIComponent(path) : '';
    return this.get(this.endpointPath('config') + qs);
  }

  /** GET /queue — current queue state. */
  public async queue(): Promise<unknown> {
    return this.get(this.endpointPath('queue'));
  }

  /** POST /queue/clear — remove all pending queue items. */
  public async clearQueue(): Promise<unknown> {
    return this.post(this.endpointPath('queueClear'), {});
  }

  /** POST /synthesize/abort — abort current synthesis. */
  public async abort(): Promise<unknown> {
    return this.post(this.endpointPath('abort'), {});
  }
}
