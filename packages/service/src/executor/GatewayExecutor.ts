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
const DEFAULT_TIMEOUT_MS = 600_000; // 10 minutes

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
  private controller: AbortController = new AbortController();

  constructor(options: GatewayExecutorOptions = {}) {
    this.gatewayUrl = (options.gatewayUrl ?? 'http://127.0.0.1:18789').replace(
      /\/+$/,
      '',
    );
    this.apiKey = options.apiKey;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.workspaceDir = options.workspaceDir ?? join(tmpdir(), 'jeeves-meta');
  }

  /** Remove a temp output file if it exists. */
  private cleanupOutputFile(outputPath: string): void {
    try {
      if (existsSync(outputPath)) unlinkSync(outputPath);
    } catch {
      /* best-effort cleanup */
    }
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

  /** Look up session metadata (tokens, completion status) via sessions_list. */
  private async getSessionInfo(
    sessionKey: string,
  ): Promise<{ tokens?: number; completed: boolean }> {
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
        return { completed: true };
      }

      const done = match.status === 'completed' || match.status === 'done';
      return { tokens: match.totalTokens, completed: done };
    } catch {
      return { completed: false };
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

  async spawn(
    task: string,
    options?: MetaSpawnOptions,
  ): Promise<MetaSpawnResult> {
    // Fresh controller for each spawn call
    this.controller = new AbortController();

    const timeoutSeconds = options?.timeout ?? DEFAULT_TIMEOUT_MS / 1000;
    const timeoutMs = timeoutSeconds * 1000;
    const deadline = Date.now() + timeoutMs;

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
      'After writing the file, reply with ONLY: NO_REPLY';

    // Step 1: Spawn the sub-agent session (unique label per cycle to avoid
    // "label already in use" errors — gateway labels persist after session completion)
    const labelBase = options?.label ?? 'jeeves-meta-synthesis';
    const label = labelBase + '-' + outputId.slice(0, 8);

    const spawnResult = await this.invoke('sessions_spawn', {
      task: taskWithOutput,
      label,
      runTimeoutSeconds: timeoutSeconds,
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

    // Step 2: Poll for completion via sessions_history
    await sleepAsync(3000);

    while (Date.now() < deadline) {
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

        // Check 1: terminal stop reason in history
        let historyDone = false;
        if (msgArray.length > 0) {
          const lastMsg = msgArray[msgArray.length - 1];
          if (
            lastMsg.role === 'assistant' &&
            lastMsg.stopReason &&
            lastMsg.stopReason !== 'toolUse' &&
            lastMsg.stopReason !== 'error'
          ) {
            historyDone = true;
          }
        }

        // Check 2: session completion status via sessions_list
        const sessionInfo = await this.getSessionInfo(sessionKey);

        if (historyDone || sessionInfo.completed) {
          const tokens = sessionInfo.tokens;

          // Read output from file (sub-agent wrote it via Write tool)
          if (existsSync(outputPath)) {
            try {
              const output = readFileSync(outputPath, 'utf8');
              return { output, tokens };
            } finally {
              try {
                unlinkSync(outputPath);
              } catch {
                /* cleanup best-effort */
              }
            }
          }

          // Fallback: extract from message content if file wasn't written
          for (let i = msgArray.length - 1; i >= 0; i--) {
            const msg = msgArray[i];
            if (msg.role === 'assistant' && msg.content) {
              const text =
                typeof msg.content === 'string'
                  ? msg.content
                  : Array.isArray(msg.content)
                    ? msg.content
                        .filter((b) => b.type === 'text' && b.text)
                        .map((b) => b.text!)
                        .join('\n')
                    : '';
              if (text) return { output: text, tokens };
            }
          }
          return { output: '', tokens };
        }
      } catch {
        // Transient poll failure — keep trying
      }

      await sleepAsync(this.pollIntervalMs);
    }

    throw new SpawnTimeoutError(
      'Synthesis subprocess timed out after ' + timeoutMs.toString() + 'ms',
      outputPath,
    );
  }
}
