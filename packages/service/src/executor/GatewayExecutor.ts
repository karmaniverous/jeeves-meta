/**
 * MetaExecutor implementation using the OpenClaw gateway HTTP API.
 *
 * Lives in the library package so both plugin and runner can import it.
 * Spawns sub-agent sessions via the gateway's `/tools/invoke` endpoint,
 * polls for completion, and extracts output text.
 *
 * @module executor/GatewayExecutor
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sleepAsync } from '@karmaniverous/jeeves';

import type {
  MetaExecutor,
  MetaSpawnOptions,
  MetaSpawnResult,
} from '../interfaces/index.js';
import { SpawnAbortedError } from './SpawnAbortedError.js';
import { SpawnTimeoutError } from './SpawnTimeoutError.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_SAFETY_VALVE_MS = 3_600_000; // 1 hour fallback

/** Options for the GatewayExecutor. */
export interface GatewayExecutorOptions {
  /** OpenClaw gateway base URL. Default: http://127.0.0.1:18789 */
  gatewayUrl?: string;
  /** Bearer token for gateway authentication. */
  apiKey?: string;
  /** Polling interval in ms. Default: 5000. */
  pollIntervalMs?: number;
  /** Workspace directory for output staging. Default: OS temp dir + /jeeves-meta. */
  workspaceDir?: string;
  /** Max retries when staging file not yet visible after session completion. Default: 10. */
  stagingRetries?: number;
  /** Delay between retries in ms. Default: 250. */
  stagingRetryDelayMs?: number;
}

/** Response shape from /tools/invoke. */
interface InvokeResponse {
  ok?: boolean;
  result?: {
    details?: Record<string, unknown>;
    messages?: Array<{
      role: string;
      content?: string;
      stopReason?: string;
      usage?: { totalTokens?: number };
    }>;
    sessions?: Array<{
      key: string;
      totalTokens?: number;
      model?: string;
      transcriptPath?: string;
    }>;
  };
  error?: { message?: string };
}

/**
 * MetaExecutor that spawns OpenClaw sessions via the gateway's
 * `/tools/invoke` endpoint.
 *
 * Used by both the OpenClaw plugin (in-process tool calls) and the
 * runner/CLI (external invocation). Constructs from `gatewayUrl` and
 * optional `apiKey` — typically sourced from `MetaConfig`.
 */
export class GatewayExecutor implements MetaExecutor {
  private readonly gatewayUrl: string;
  private readonly apiKey: string | undefined;
  private readonly pollIntervalMs: number;
  private readonly workspaceDir: string;
  private readonly stagingRetries: number;
  private readonly stagingRetryDelayMs: number;
  private controller: AbortController = new AbortController();

  constructor(options: GatewayExecutorOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? 'http://127.0.0.1:18789').replace(
      /\/+$/,
      '',
    );
    this.apiKey = options.apiKey;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.workspaceDir = options.workspaceDir ?? join(tmpdir(), 'jeeves-meta');
    this.stagingRetries = options.stagingRetries ?? 10;
    this.stagingRetryDelayMs = options.stagingRetryDelayMs ?? 250;
  }

  /** Remove a temp output file if it exists. */
  private cleanupOutputFile(outputPath: string): void {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch {
      /* best-effort cleanup */
    }
  }

  /** Read and clean up the staging output file. Returns content or undefined if absent. */
  private readStagingFile(outputPath: string): string | undefined {
    if (!existsSync(outputPath)) return undefined;
    try {
      return readFileSync(outputPath, 'utf8');
    } finally {
      this.cleanupOutputFile(outputPath);
    }
  }

  /** Extract plain text from a message content field, skipping ANNOUNCE_SKIP sentinels. */
  private static extractMessageText(
    content: string | Array<{ type: string; text?: string }> | undefined,
  ): string | undefined {
    if (!content) return undefined;
    const text =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? content
              .filter((b) => b.type === 'text' && b.text)
              .map((b) => b.text!)
              .join('\n')
          : '';
    return text && text.trim() !== 'ANNOUNCE_SKIP' ? text : undefined;
  }

  /**
   * Check history messages for timeout detection.
   *
   * Does NOT determine completion — session completion is authoritative
   * (via sessions_list). History stop reasons can false-positive on
   * sessions_yield artifacts (#200).
   */
  private static checkHistoryCompletion(
    messages: Array<{ role: string; stopReason?: string }>,
  ): { timedOut: boolean } {
    if (messages.length === 0) return { timedOut: false };
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant' || !last.stopReason)
      return { timedOut: false };
    return { timedOut: last.stopReason === 'timeout' };
  }

  /** Invoke a gateway tool via the /tools/invoke HTTP endpoint. */
  private async invoke(
    tool: string,
    args: Record<string, unknown>,
    sessionKey?: string,
  ): Promise<InvokeResponse> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = 'Bearer ' + this.apiKey;
    }

    const body: Record<string, unknown> = { tool, args };
    if (sessionKey) body.sessionKey = sessionKey;

    const res = await fetch(this.gatewayUrl + '/tools/invoke', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Gateway ${tool} failed: HTTP ${res.status.toString()} - ${text}`,
      );
    }

    const data = (await res.json()) as InvokeResponse;
    if (data.ok === false || data.error) {
      throw new Error(
        `Gateway ${tool} error: ${data.error?.message ?? JSON.stringify(data)}`,
      );
    }

    return data;
  }

  /**
   * Look up session metadata (tokens, completion status) via sessions_list.
   *
   * Detects gateway-side timeout (`status: "timeout"`) and killed sessions
   * (`status: "killed"`) as completed, with a `timedOut` flag to distinguish
   * timeout from normal completion.
   */
  private async getSessionInfo(
    sessionKey: string,
  ): Promise<{ tokens?: number; completed: boolean; timedOut: boolean }> {
    try {
      const result = await this.invoke('sessions_list', {
        limit: 200,
        messageLimit: 0,
      });

      const sessions = (result.result?.details?.sessions ??
        result.result?.sessions ??
        []) as Array<{
        key: string;
        totalTokens?: number;
        status?: string;
      }>;

      const match = sessions.find((s) => s.key === sessionKey);
      if (!match) {
        // Session absent from list — likely cleaned up after completion.
        // With limit=200 this is reliable; a false positive here only
        // means we read the output file slightly early (still correct
        // if the file exists).
        return { completed: true, timedOut: false };
      }

      const status = match.status;
      const done =
        status === 'completed' ||
        status === 'done' ||
        status === 'timeout' ||
        status === 'killed';
      const timedOut = status === 'timeout';
      return { tokens: match.totalTokens, completed: done, timedOut };
    } catch {
      return { completed: false, timedOut: false };
    }
  }

  /** Whether this executor has been aborted by the operator. */
  get aborted(): boolean {
    return this.controller.signal.aborted;
  }

  /** Abort the currently running spawn, if any. */
  abort(): void {
    this.controller.abort();
  }

  /**
   * Query the gateway's configured subagent run timeout.
   *
   * Returns the value in milliseconds, or `undefined` if the query fails
   * or the value is absent/zero (no timeout configured).
   */
  private async queryGatewayRunTimeout(): Promise<number | undefined> {
    try {
      const result = await this.invoke('session_status', {});
      const details = (result.result?.details ?? result.result ?? {}) as Record<
        string,
        unknown
      >;
      const runTimeoutSeconds =
        (details.runTimeoutSeconds as number | undefined) ??
        (details.timeout as number | undefined);
      if (typeof runTimeoutSeconds === 'number' && runTimeoutSeconds > 0) {
        return runTimeoutSeconds * 1000;
      }
    } catch {
      // Gateway unreachable or field not exposed — fall back to default
    }
    return undefined;
  }

  async spawn(
    task: string,
    options?: MetaSpawnOptions,
  ): Promise<MetaSpawnResult> {
    // Fresh controller for each spawn call
    this.controller = new AbortController();

    // Safety-valve deadline: gateway's runTimeoutSeconds + 60s buffer,
    // defaulting to 1 hour if the gateway value is 0/absent/query fails.
    // This is a circuit breaker, not a timeout mechanism.
    const gatewayTimeoutMs = await this.queryGatewayRunTimeout();
    const safetyValveMs = gatewayTimeoutMs
      ? gatewayTimeoutMs + 60_000
      : DEFAULT_SAFETY_VALVE_MS;
    const safetyDeadline = Date.now() + safetyValveMs;

    // Ensure workspace dir exists
    if (!existsSync(this.workspaceDir)) {
      mkdirSync(this.workspaceDir, { recursive: true });
    }

    // Generate unique output path for file-based output
    const outputId = randomUUID();
    const outputPath = this.workspaceDir + '/output-' + outputId + '.json';

    // Append file output instruction to the task
    const taskWithOutput =
      task +
      '\n\n## OUTPUT DELIVERY\n\n' +
      'Write your complete output to a file using the Write tool at:\n' +
      outputPath +
      '\n\n' +
      'After writing the file, your final message must be exactly: ANNOUNCE_SKIP';

    // Step 1: Spawn the sub-agent session (unique label per cycle to avoid
    // "label already in use" errors — gateway labels persist after session completion)
    const labelBase = options?.label ?? 'jeeves-meta-synthesis';
    const label = labelBase + '-' + outputId.slice(0, 8);

    const spawnResult = await this.invoke('sessions_spawn', {
      task: taskWithOutput,
      label,
      ...(options?.thinking ? { thinking: options.thinking } : {}),
      ...(options?.model ? { model: options.model } : {}),
    });

    const details = (spawnResult.result?.details ??
      spawnResult.result ??
      {}) as Record<string, unknown>;
    const sessionKey = details.childSessionKey ?? details.sessionKey;

    if (typeof sessionKey !== 'string' || !sessionKey) {
      throw new Error(
        'Gateway sessions_spawn returned no sessionKey: ' +
          JSON.stringify(spawnResult),
      );
    }

    // Step 2: Poll for completion — gateway owns the subagent lifecycle.
    // Loop exits via: (a) completion detection, (b) abort signal,
    // (c) gateway-side timeout detection, or (d) safety-valve circuit breaker.
    await sleepAsync(3000);

    while (true) {
      // Safety-valve circuit breaker
      if (Date.now() >= safetyDeadline) {
        this.cleanupOutputFile(outputPath);
        throw new SpawnTimeoutError(
          'Safety-valve deadline exceeded (' +
            safetyValveMs.toString() +
            'ms) — gateway timeout may be misconfigured',
          outputPath,
        );
      }

      // Check for abort before each poll iteration
      if (this.controller.signal.aborted) {
        this.cleanupOutputFile(outputPath);
        throw new SpawnAbortedError();
      }

      try {
        const historyResult = await this.invoke('sessions_history', {
          sessionKey,
          limit: 5,
          includeTools: false,
        });

        const messages =
          historyResult.result?.details?.messages ??
          historyResult.result?.messages ??
          [];
        const msgArray = messages as Array<{
          role: string;
          content?: string | Array<{ type: string; text?: string }>;
          stopReason?: string;
          usage?: { totalTokens?: number };
        }>;

        // Check 1: history-based timeout detection (stop reason)
        const { timedOut: historyTimedOut } =
          GatewayExecutor.checkHistoryCompletion(msgArray);

        // Check 2: session completion status via sessions_list
        // Gate on session completion only — history stop reasons can
        // false-positive on sessions_yield artifacts (#200).
        const sessionInfo = await this.getSessionInfo(sessionKey);
        const timedOut = sessionInfo.timedOut || historyTimedOut;

        if (sessionInfo.completed) {
          const tokens = sessionInfo.tokens;

          // Gateway-side timeout detected — check staging file for recovery
          if (timedOut) {
            const output = this.readStagingFile(outputPath);
            if (output !== undefined) return { output, tokens };
            // No output or partial output — throw for _state recovery (§3.16.6)
            throw new SpawnTimeoutError(
              'Gateway-side timeout detected (session status: timeout)',
              outputPath,
            );
          }

          // Normal completion — read staging file with retry for delayed visibility
          const output = this.readStagingFile(outputPath);
          if (output !== undefined) return { output, tokens };

          // Staging file not yet visible — retry with bounded grace window
          for (let i = 0; i < this.stagingRetries; i++) {
            await sleepAsync(this.stagingRetryDelayMs);
            const retryOutput = this.readStagingFile(outputPath);
            if (retryOutput !== undefined)
              return { output: retryOutput, tokens };
          }

          // Fallback: extract from message content if file wasn't written.
          // Skip ANNOUNCE_SKIP sentinel messages — the real output is in
          // a preceding assistant message (the file write).
          for (let i = msgArray.length - 1; i >= 0; i--) {
            const msg = msgArray[i];
            if (msg.role === 'assistant') {
              const text = GatewayExecutor.extractMessageText(msg.content);
              if (text !== undefined) return { output: text, tokens };
            }
          }
          return { output: '', tokens };
        }
      } catch (err) {
        // Re-throw SpawnTimeoutError and SpawnAbortedError — only swallow transient poll failures
        if (
          err instanceof SpawnTimeoutError ||
          err instanceof SpawnAbortedError
        ) {
          throw err;
        }
        // Transient poll failure — keep trying
      }

      await sleepAsync(this.pollIntervalMs);
    }
  }
}
