/**
 * Thin HTTP client for the jeeves-meta service.
 *
 * Plugin delegates all operations to the running service via HTTP.
 * Response types are defined here as the single source of truth —
 * consumers should not redefine them.
 *
 * @module serviceClient
 */

/** Watcher dependency health within the status response. */
export interface WatcherDepHealth {
  status: string;
  rulesRegistered?: boolean;
  indexing?: boolean;
}

/** Gateway dependency health within the status response. */
export interface GatewayDepHealth {
  status: string;
}

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
    dependencies: {
      watcher: WatcherDepHealth;
      gateway: GatewayDepHealth;
    };
    [key: string]: unknown;
  };
}

/** Summary block in the metas response. */
export interface MetasSummary {
  total: number;
  stale: number;
  errors: number;
  neverSynthesized: number;
  stalestPath: string | null;
  lastSynthesizedPath: string | null;
  lastSynthesizedAt: string | null;
  tokens: { architect: number; builder: number; critic: number };
}

/** Per-meta item in the metas response. */
export interface MetasItem {
  stalenessSeconds: number | null;
  [key: string]: unknown;
}

/** Response from GET /metas. */
export interface MetasResponse {
  summary: MetasSummary;
  metas: MetasItem[];
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
    const res = await fetch(this.baseUrl + path);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `META ${path} ${String(res.status)} ${res.statusText}: ${text}`,
      );
    }
    return res.json() as Promise<T>;
  }

  /** POST helper — returns parsed JSON. */
  private async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `META ${path} ${String(res.status)} ${res.statusText}: ${text}`,
      );
    }
    return res.json() as Promise<T>;
  }

  /** GET /status — service health + queue state. */
  public async status(): Promise<StatusResponse> {
    return this.get<StatusResponse>('/status');
  }

  /** GET /metas — list all meta entities with summary. */
  public async listMetas(params?: {
    pathPrefix?: string;
    hasError?: boolean;
    staleHours?: number;
    neverSynthesized?: boolean;
    locked?: boolean;
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
    if (params?.fields?.length) qs.set('fields', params.fields.join(','));
    const query = qs.toString();
    return this.get<MetasResponse>('/metas' + (query ? '?' + query : ''));
  }

  /** GET /metas/:path — detail for a single meta. */
  public async detail(
    metaPath: string,
    options?: { includeArchive?: boolean | number; fields?: string[] },
  ): Promise<unknown> {
    const encoded = encodeURIComponent(metaPath);
    const qs = new URLSearchParams();
    if (options?.includeArchive !== undefined)
      qs.set('includeArchive', String(options.includeArchive));
    if (options?.fields?.length) qs.set('fields', options.fields.join(','));
    const query = qs.toString();
    return this.get(`/metas/${encoded}` + (query ? '?' + query : ''));
  }

  /** GET /preview — dry-run next synthesis candidate. */
  public async preview(path?: string): Promise<unknown> {
    const qs = path ? '?path=' + encodeURIComponent(path) : '';
    return this.get('/preview' + qs);
  }

  /** POST /synthesize — enqueue synthesis. */
  public async synthesize(path?: string): Promise<unknown> {
    return this.post('/synthesize', path ? { path } : {});
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
    return this.post('/seed', body);
  }

  /** POST /unlock — remove .lock from a meta entity. */
  public async unlock(path: string): Promise<unknown> {
    return this.post('/unlock', { path });
  }

  /** GET /config — query service config with optional JSONPath. */
  public async config(path?: string): Promise<unknown> {
    const qs = path ? '?path=' + encodeURIComponent(path) : '';
    return this.get('/config' + qs);
  }

  /** GET /queue — current queue state. */
  public async queue(): Promise<unknown> {
    return this.get('/queue');
  }

  /** POST /queue/clear — remove all pending queue items. */
  public async clearQueue(): Promise<unknown> {
    return this.post('/queue/clear', {});
  }

  /** POST /synthesize/abort — abort current synthesis. */
  public async abort(): Promise<unknown> {
    return this.post('/synthesize/abort', {});
  }
}
