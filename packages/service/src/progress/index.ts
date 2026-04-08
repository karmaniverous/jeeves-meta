/**
 * Progress reporting via OpenClaw gateway `/tools/invoke` → `message` tool.
 *
 * @module progress
 */

import type { Logger } from 'pino';

import { normalizePath } from '../normalizePath.js';

export type ProgressPhase = 'architect' | 'builder' | 'critic';

export type ProgressEvent = {
  type:
    | 'synthesis_start'
    | 'phase_start'
    | 'phase_complete'
    | 'synthesis_complete'
    | 'error';
  /** Owner path (not .meta path) of the entity being synthesized. */
  path: string;
  phase?: ProgressPhase;
  tokens?: number;
  durationMs?: number;
  error?: string;
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
  /** Optional base URL for the service, used to construct entity links. */
  serverBaseUrl?: string;
};

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatSeconds(durationMs: number): string {
  const seconds = durationMs / 1000;
  return Math.round(seconds).toString() + 's';
}

function titleCasePhase(phase: ProgressPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1);
}

/**
 * URL-encode each path segment individually so that spaces and special
 * characters are safe while preserving the `/` separators.
 */
function encodePathSegments(p: string): string {
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Build a link (or plain path) to the owner directory. */
function buildDirectoryLink(path: string, serverBaseUrl?: string): string {
  const normalized = normalizePath(path).replace(/^([A-Za-z]):/, '/$1');
  const encoded = encodePathSegments(normalized);

  if (!serverBaseUrl) return normalized;

  const base = serverBaseUrl.replace(/\/+$/, '');
  return `${base}/path${encoded}`;
}

/** Build a link (or plain path) to the entity's meta.json output file. */
function buildMetaJsonLink(path: string, serverBaseUrl?: string): string {
  const normalized = normalizePath(path).replace(/^([A-Za-z]):/, '/$1');
  const metaJsonPath = `${normalized}/.meta/meta.json`;
  const encoded = encodePathSegments(metaJsonPath);

  if (!serverBaseUrl) return metaJsonPath;

  const base = serverBaseUrl.replace(/\/+$/, '');
  return `${base}/path${encoded}`;
}

export function formatProgressEvent(
  event: ProgressEvent,
  serverBaseUrl?: string,
): string {
  switch (event.type) {
    case 'synthesis_start': {
      const dirLink = buildDirectoryLink(event.path, serverBaseUrl);
      return `🔬 Started meta synthesis: ${dirLink}`;
    }

    case 'phase_start': {
      if (!event.phase) {
        return '  ⚙️ Phase started';
      }
      return `  ⚙️ ${titleCasePhase(event.phase)} phase started`;
    }

    case 'phase_complete': {
      const phase = event.phase ? titleCasePhase(event.phase) : 'Phase';
      const tokenStr =
        event.tokens !== undefined
          ? formatNumber(event.tokens) + ' tokens'
          : 'unknown tokens';
      const duration =
        event.durationMs !== undefined ? formatSeconds(event.durationMs) : '0s';
      return `  ✅ ${phase} complete (${tokenStr} / ${duration})`;
    }

    case 'synthesis_complete': {
      const metaLink = buildMetaJsonLink(event.path, serverBaseUrl);
      const tokenStr =
        event.tokens !== undefined
          ? formatNumber(event.tokens) + ' tokens'
          : 'unknown tokens';
      const duration =
        event.durationMs !== undefined
          ? formatSeconds(event.durationMs)
          : '0.0s';
      return `✅ Completed: ${metaLink} (${tokenStr} / ${duration})`;
    }

    case 'error': {
      const dirLink = buildDirectoryLink(event.path, serverBaseUrl);
      const phase = event.phase ? `${titleCasePhase(event.phase)} ` : '';
      const error = event.error ?? 'Unknown error';
      return `❌ Synthesis failed at ${phase}phase: ${dirLink}\n   Error: ${error}`;
    }

    default: {
      return 'Unknown progress event';
    }
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

  public constructor(config: ProgressReporterConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public async report(event: ProgressEvent): Promise<void> {
    // Multi-channel mode: reportTarget is the destination, reportChannel is the platform.
    // Legacy mode: reportChannel alone acts as the target (backward compatible).
    const target = this.config.reportTarget ?? this.config.reportChannel;
    if (!target) return;

    const message = formatProgressEvent(event, this.config.serverBaseUrl);
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
