/**
 * Progress reporting via OpenClaw gateway `/tools/invoke` → `message` tool.
 *
 * @module progress
 */

import type { Logger } from 'pino';

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
  /** Gateway channel target (platform-agnostic). If unset, reporting is disabled. */
  reportChannel?: string;
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

/** Build a link to the entity's meta.json output file. */
function buildEntityLink(path: string, serverBaseUrl?: string): string {
  // Convert Windows-style path to forward-slash for consistent path handling
  const normalized = path.replace(/^([A-Za-z]):/, '/$1').replace(/\\/g, '/');
  const metaJsonPath = `${normalized}/.meta/meta.json`;

  if (!serverBaseUrl) return metaJsonPath;

  const base = serverBaseUrl.replace(/\/+$/, '');
  return `${base}/path${metaJsonPath}`;
}

export function formatProgressEvent(
  event: ProgressEvent,
  serverBaseUrl?: string,
): string {
  const pathDisplay = buildEntityLink(event.path, serverBaseUrl);

  switch (event.type) {
    case 'synthesis_start':
      return `🔬 Started meta synthesis: ${pathDisplay}`;

    case 'phase_start': {
      if (!event.phase) {
        return '  ⚙️ Phase started';
      }
      return `  ⚙️ ${titleCasePhase(event.phase)} phase started`;
    }

    case 'phase_complete': {
      const phase = event.phase ? titleCasePhase(event.phase) : 'Phase';
      const tokens = event.tokens ?? 0;
      const duration =
        event.durationMs !== undefined ? formatSeconds(event.durationMs) : '0s';
      return `  ✅ ${phase} complete (${formatNumber(tokens)} tokens / ${duration})`;
    }

    case 'synthesis_complete': {
      const tokens = event.tokens ?? 0;
      const duration =
        event.durationMs !== undefined
          ? formatSeconds(event.durationMs)
          : '0.0s';
      return `✅ Completed: ${pathDisplay} (${formatNumber(tokens)} tokens / ${duration})`;
    }

    case 'error': {
      const phase = event.phase ? `${titleCasePhase(event.phase)} ` : '';
      const error = event.error ?? 'Unknown error';
      return `❌ Synthesis failed at ${phase}phase: ${pathDisplay}\n   Error: ${error}`;
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
    const target = this.config.reportChannel;
    if (!target) return;

    const message = formatProgressEvent(event, this.config.serverBaseUrl);
    const url = new URL('/tools/invoke', this.config.gatewayUrl);

    const payload: GatewayInvokeRequest = {
      tool: 'message',
      args: {
        action: 'send',
        target,
        message,
      },
    };

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
