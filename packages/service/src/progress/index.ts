/**
 * Progress reporting via OpenClaw gateway `/tools/invoke` → `message` tool.
 *
 * Progress events are rendered using Handlebars templates. Owner-path links
 * are resolved via the jeeves-server resolve-path API, with graceful
 * fallback to raw filesystem paths when the server is unreachable.
 *
 * @module progress
 */

import { fetchWithTimeout } from '@karmaniverous/jeeves';
import Handlebars from 'handlebars';
import type { Logger } from 'pino';

import { DEFAULT_TEMPLATE_STRINGS } from '../schema/config.js';

export type ProgressPhase = 'architect' | 'builder' | 'critic';

export type ProgressEvent = {
  type: 'phase_start' | 'phase_complete' | 'error';
  /** Owner path (not .meta path) of the entity being synthesized. */
  path: string;
  phase?: ProgressPhase;
  tokens?: number;
  durationMs?: number;
  error?: string;
};

/** Compiled Handlebars templates for the three progress event types. */
type CompiledTemplates = {
  phaseStart: HandlebarsTemplateDelegate;
  phaseEnd: HandlebarsTemplateDelegate;
  phaseError: HandlebarsTemplateDelegate;
};

/** Raw (string) template config — mirrors the schema definition. */
export type TemplateStrings = {
  phaseStart: string;
  phaseEnd: string;
  phaseError: string;
};

export type ProgressReporterConfig = {
  gatewayUrl: string;
  gatewayApiKey?: string;
  /**
   * Messaging channel name (e.g. 'slack'). When set alongside reportTarget,
   * included in the gateway message payload as `channel`.
   * Legacy: if reportTarget is unset, reportChannel is used as the target
   * (single-channel mode, backward compatible).
   */
  reportChannel?: string;
  /** Channel/user ID to send messages to. Takes priority over reportChannel as target. */
  reportTarget?: string;
  /**
   * URL of the local jeeves-server instance, used to resolve filesystem paths
   * to browse links via the resolve-path API.
   * Default: http://127.0.0.1:1934
   */
  serverUrl?: string;
  /** Handlebars template strings for each progress event type. */
  templates?: Partial<TemplateStrings>;
};

/** Compile raw template strings into Handlebars delegates. */
function compileTemplates(
  raw: Partial<TemplateStrings> | undefined,
): CompiledTemplates {
  const merged: TemplateStrings = {
    phaseStart: raw?.phaseStart ?? DEFAULT_TEMPLATE_STRINGS.phaseStart,
    phaseEnd: raw?.phaseEnd ?? DEFAULT_TEMPLATE_STRINGS.phaseEnd,
    phaseError: raw?.phaseError ?? DEFAULT_TEMPLATE_STRINGS.phaseError,
  };
  return {
    phaseStart: Handlebars.compile(merged.phaseStart),
    phaseEnd: Handlebars.compile(merged.phaseEnd),
    phaseError: Handlebars.compile(merged.phaseError),
  };
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Resolve a filesystem path to a browse URL via the jeeves-server
 * resolve-path API. Returns the raw path as fallback on any failure.
 *
 * On HTTP 200, uses publicUrl if present, otherwise prefixes serverUrl
 * to browseUrl. On any error or non-200 response, returns fsPath as-is.
 */
/** Timeout for resolve-path API calls (ms). */
const RESOLVE_PATH_TIMEOUT_MS = 3000;

async function resolveLink(fsPath: string, serverUrl: string): Promise<string> {
  try {
    const url = new URL('/api/resolve-path', serverUrl);
    url.searchParams.set('fsPath', fsPath);
    const res = await fetchWithTimeout(url.toString(), RESOLVE_PATH_TIMEOUT_MS);
    if (!res.ok) return fsPath;
    const data = (await res.json()) as {
      browsePath?: string;
      browseUrl?: string;
      publicUrl?: string;
    };
    if (data.publicUrl) return data.publicUrl;
    if (data.browseUrl) {
      const base = serverUrl.replace(/\/+$/, '');
      return base + data.browseUrl;
    }
    return fsPath;
  } catch {
    return fsPath;
  }
}

/** Resolve browse links for both the owner directory and its meta.json. */
async function resolveLinks(
  ownerPath: string,
  serverUrl: string,
): Promise<{ dirLink: string; metaLink: string }> {
  const dirLink = await resolveLink(ownerPath, serverUrl);
  // Derive metaLink by appending /.meta/meta.json to the resolved dir link
  const metaLink = dirLink.replace(/\/+$/, '') + '/.meta/meta.json';
  return { dirLink, metaLink };
}

/** Data bag passed to every Handlebars template. */
interface TemplateData {
  dirPath: string;
  metaPath: string;
  dirLink: string;
  metaLink: string;
  phase: string;
  seconds?: string;
  tokens?: string;
  error?: string;
}

/**
 * Render the appropriate template for a progress event.
 *
 * @param event - The progress event to render.
 * @param templates - Compiled Handlebars templates.
 * @param serverUrl - jeeves-server URL for resolve-path API.
 * @returns Rendered message string.
 */
export async function renderProgressEvent(
  event: ProgressEvent,
  templates: CompiledTemplates,
  serverUrl: string,
): Promise<string> {
  const ownerPath = event.path;
  const metaPath = ownerPath.replace(/\/+$/, '') + '/.meta/meta.json';
  const phase = (event.phase ?? 'unknown').toUpperCase();
  const { dirLink, metaLink } = await resolveLinks(ownerPath, serverUrl);

  const base: TemplateData = {
    dirPath: ownerPath,
    metaPath,
    dirLink,
    metaLink,
    phase,
  };

  switch (event.type) {
    case 'phase_start':
      return templates.phaseStart(base);

    case 'phase_complete': {
      const seconds =
        event.durationMs !== undefined
          ? String(Math.round(event.durationMs / 1000))
          : '0';
      const tokens =
        event.tokens !== undefined ? formatNumber(event.tokens) : 'unknown';
      return templates.phaseEnd({ ...base, seconds, tokens });
    }

    case 'error': {
      const seconds =
        event.durationMs !== undefined
          ? String(Math.round(event.durationMs / 1000))
          : '0';
      const errorMsg = event.error ?? 'Unknown error';
      return templates.phaseError({ ...base, seconds, error: errorMsg });
    }

    default:
      return 'Unknown progress event';
  }
}

type GatewayInvokeRequest = {
  tool: 'message';
  args: {
    action: 'send';
    target: string;
    message: string;
    channel?: string;
  };
};

export class ProgressReporter {
  private readonly config: ProgressReporterConfig;
  private readonly logger: Logger;
  private templates: CompiledTemplates;
  /** Snapshot of template source strings used to compile `this.templates`. */
  private lastTemplateSource: string;
  private readonly serverUrl: string;

  public constructor(config: ProgressReporterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.templates = compileTemplates(config.templates);
    this.lastTemplateSource = JSON.stringify(config.templates);
    this.serverUrl = config.serverUrl ?? 'http://127.0.0.1:1934';
  }

  public async report(event: ProgressEvent): Promise<void> {
    // Multi-channel mode: reportTarget is the destination, reportChannel is the platform.
    // Legacy mode: reportChannel alone acts as the target (backward compatible).
    const target = this.config.reportTarget ?? this.config.reportChannel;
    if (!target) return;

    // Detect template hot-reload: config.templates may be mutated by
    // applyHotReloadedConfig; recompile when the source strings change.
    const currentSource = JSON.stringify(this.config.templates);
    if (currentSource !== this.lastTemplateSource) {
      this.templates = compileTemplates(this.config.templates);
      this.lastTemplateSource = currentSource;
      this.logger.info('Progress templates recompiled (hot-reload)');
    }

    let message: string;
    try {
      message = await renderProgressEvent(
        event,
        this.templates,
        this.serverUrl,
      );
    } catch (err) {
      this.logger.warn({ err }, 'Progress event rendering failed');
      return;
    }

    const url = new URL('/tools/invoke', this.config.gatewayUrl);

    const args: GatewayInvokeRequest['args'] = {
      action: 'send',
      target,
      message,
    };

    // Include channel field only in multi-channel mode (reportTarget is set)
    if (this.config.reportTarget && this.config.reportChannel) {
      args.channel = this.config.reportChannel;
    }

    const payload: GatewayInvokeRequest = { tool: 'message', args };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.config.gatewayApiKey
            ? { authorization: `Bearer ${this.config.gatewayApiKey}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          { status: res.status, statusText: res.statusText, body: text },
          'Progress reporting failed',
        );
      }
    } catch (err) {
      this.logger.warn({ err }, 'Progress reporting threw');
    }
  }
}
