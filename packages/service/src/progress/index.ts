/**
 * Progress reporting via OpenClaw gateway `/tools/invoke` → `message` tool.
 *
 * Progress events are rendered using Handlebars templates (see
 * `progress/render`). Owner-path links are resolved via the jeeves-server
 * resolve-path API (authenticated with `serverKey`), falling back to raw
 * filesystem paths when the server is unreachable and omitting links when
 * the server refuses the key.
 *
 * @module progress
 */

import type { Logger } from 'pino';

import {
  type CompiledTemplates,
  compileTemplates,
  type ProgressEvent,
  renderProgressEvent,
  type TemplateStrings,
} from './render.js';

export {
  type ProgressEvent,
  renderProgressEvent,
  type TemplateStrings,
} from './render.js';

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
  /**
   * jeeves-server machine key seed. Only the key derived from it is sent to
   * the resolve-path API. Read on every report, so hot-reloaded changes
   * apply immediately.
   */
  serverKey?: string;
  /** Handlebars template strings for each progress event type. */
  templates?: Partial<TemplateStrings>;
};

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
  /** Unauthorized causes already warned about; each is logged once. */
  private readonly reportedAuthCauses = new Set<'missing' | 'rejected'>();

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
      try {
        this.templates = compileTemplates(this.config.templates);
        this.lastTemplateSource = currentSource;
        this.logger.info('Progress templates recompiled (hot-reload)');
      } catch (err) {
        this.logger.warn(
          { err },
          'Failed to compile hot-reloaded templates; keeping previous templates',
        );
      }
    }

    let message: string;
    try {
      message = await renderProgressEvent(
        event,
        this.templates,
        this.serverUrl,
        {
          serverKey: this.config.serverKey,
          onUnauthorized: (status) => {
            this.warnUnauthorized(status);
          },
        },
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

  /** Warn once per distinct cause when jeeves-server refuses resolve-path. */
  private warnUnauthorized(status: number): void {
    const reason = this.config.serverKey ? 'rejected' : 'missing';
    if (this.reportedAuthCauses.has(reason)) return;
    this.reportedAuthCauses.add(reason);
    this.logger.warn(
      { status, serverUrl: this.serverUrl },
      reason === 'missing'
        ? 'jeeves-server requires a machine key for resolve-path; set serverKey in meta config. Progress reports omit links until then.'
        : 'jeeves-server rejected serverKey for resolve-path; check the machine key. Progress reports omit links until then.',
    );
  }
}
