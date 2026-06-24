/**
 * Tests for GatewayExecutor.
 *
 * Covers: successful spawn, gateway-side timeout detection (with/without
 * complete output), safety-valve circuit breaker, and abort with
 * SpawnAbortedError. All gateway HTTP calls are mocked.
 *
 * @module executor/GatewayExecutor.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { sleepAsync } from '@karmaniverous/jeeves';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock sleepAsync to resolve with a minimal macrotask yield (the real 3s
// initial sleep would exceed vitest's default 5s timeout). Using setTimeout(r, 0)
// instead of Promise.resolve() so the event loop yields for abort signals
// and Date.now mock updates.
vi.mock('@karmaniverous/jeeves', () => ({
  sleepAsync: vi.fn(() => new Promise<void>((r) => setTimeout(r, 0))),
}));

import { GatewayExecutor } from './GatewayExecutor.js';
import { SpawnAbortedError } from './SpawnAbortedError.js';
import { SpawnTimeoutError } from './SpawnTimeoutError.js';

const mockFetch = vi.fn();
let testDir: string;

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  testDir = join(tmpdir(), 'gw-exec-test-' + Date.now().toString());
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(testDir, { recursive: true, force: true });
});

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

/**
 * Extract the output file path from a sessions_spawn call in the mock history.
 * Returns undefined if the spawn call hasn't happened yet.
 */
function findOutputPath(): string | undefined {
  for (const call of mockFetch.mock.calls) {
    const init = call[1] as RequestInit;
    if (!init.body) continue;
    try {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      if (body.tool !== 'sessions_spawn') continue;
      const args = body.args as Record<string, unknown>;
      const task = args.task as string;
      const match = task.match(/Write tool at:\n(.+?output-[a-f0-9-]+\.json)/);
      if (match?.[1]) return match[1];
    } catch {
      continue;
    }
  }
  return undefined;
}

interface MockHandlers {
  sessionKey: string;
  /** Called on sessions_spawn to capture/assert args. */
  onSpawn?: (args: Record<string, unknown>) => void;
  /** What sessions_history returns. Defaults to a single endTurn assistant message. */
  historyMessages?: Array<Record<string, unknown>>;
  /** Called on sessions_history (e.g. to write the output file). */
  onHistory?: () => void;
  /** sessions_list session entries. Default: [\{ key, status: 'done' \}]. */
  sessions?: Array<Record<string, unknown>>;
  /** session_status details. Default: \{\} (no timeout). */
  statusDetails?: Record<string, unknown>;
}

/**
 * Install a mock fetch implementation that routes common tool calls.
 * Covers: session_status, sessions_spawn, sessions_history, sessions_list.
 */
function installMock(handlers: MockHandlers) {
  mockFetch.mockImplementation((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    const tool = body.tool as string;

    if (tool === 'session_status') {
      return jsonResponse({
        ok: true,
        result: { details: handlers.statusDetails ?? {} },
      });
    }

    if (tool === 'sessions_spawn') {
      const args = body.args as Record<string, unknown>;
      handlers.onSpawn?.(args);
      return jsonResponse({
        ok: true,
        result: { details: { childSessionKey: handlers.sessionKey } },
      });
    }

    if (tool === 'sessions_history') {
      handlers.onHistory?.();
      return jsonResponse({
        ok: true,
        result: {
          details: {
            messages: handlers.historyMessages ?? [
              { role: 'assistant', content: 'Done', stopReason: 'endTurn' },
            ],
          },
        },
      });
    }

    if (tool === 'sessions_list') {
      return jsonResponse({
        ok: true,
        result: {
          details: {
            sessions: handlers.sessions ?? [
              { key: handlers.sessionKey, status: 'done' },
            ],
          },
        },
      });
    }

    return jsonResponse({ ok: true });
  });
}

describe('GatewayExecutor.spawn', () => {
  it('returns output from file-based staging on successful completion', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'test-session-1',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Test synthesis output' }),
          );
        }
      },
      sessions: [{ key: 'test-session-1', totalTokens: 5000, status: 'done' }],
    });

    const result = await executor.spawn('Test task');

    expect(result.output).toContain('Test synthesis output');
    expect(result.tokens).toBe(5000);
    // Stateless spawning: no parent sessionKey attached to requests
    const hasSessionKey = mockFetch.mock.calls.some((call) => {
      const init = call[1] as RequestInit;
      if (!init.body) return false;
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      return typeof body.sessionKey === 'string';
    });
    expect(hasSessionKey).toBe(false);
  });

  it('does not pass runTimeoutSeconds to sessions_spawn', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'test-no-timeout',
      onSpawn: (args) => {
        expect(args).not.toHaveProperty('runTimeoutSeconds');
        expect(args).not.toHaveProperty('timeout');
      },
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op))
          writeFileSync(op, JSON.stringify({ _content: 'ok' }));
      },
      sessions: [{ key: 'test-no-timeout', totalTokens: 100, status: 'done' }],
    });

    await executor.spawn('Test task');
  });

  it('throws SpawnAbortedError when abort() is called', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 50,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'test-session-3',
      onSpawn: () => {
        // Abort immediately after spawn returns
        setTimeout(() => {
          executor.abort();
        }, 10);
      },
      historyMessages: [{ role: 'user', content: 'hi' }],
      sessions: [{ key: 'test-session-3', status: 'running' }],
    });

    await expect(executor.spawn('Task')).rejects.toThrow(SpawnAbortedError);
  });

  it('throws on gateway HTTP error during spawn', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      workspaceDir: testDir,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      // session_status is called first for safety-valve query
      if (body.tool === 'session_status') {
        return jsonResponse({ ok: true, result: { details: {} } });
      }
      // sessions_spawn returns HTTP 401
      return jsonResponse({ error: 'Unauthorized' }, 401);
    });

    await expect(executor.spawn('Task')).rejects.toThrow('HTTP 401');
  });

  it('throws when sessions_spawn returns no sessionKey', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      workspaceDir: testDir,
    });

    // session_status first, then sessions_spawn
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      if (body.tool === 'session_status') {
        return jsonResponse({ ok: true, result: { details: {} } });
      }
      return jsonResponse({ ok: true, result: { details: {} } });
    });

    await expect(executor.spawn('Task')).rejects.toThrow(
      'returned no sessionKey',
    );
  });

  it('completes via sessionInfo.completed when history has no terminal stopReason', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-info-test',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op))
          writeFileSync(op, 'Session info completion output');
      },
      historyMessages: [
        { role: 'assistant', content: 'Working...', stopReason: null },
      ],
      sessions: [
        { key: 'sess-info-test', totalTokens: 3000, status: 'completed' },
      ],
    });

    const result = await executor.spawn('Task');
    expect(result.output).toBe('Session info completion output');
    expect(result.tokens).toBe(3000);
  });

  it('treats missing session in sessions_list as completed', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-gone',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op)) writeFileSync(op, 'Gone session output');
      },
      historyMessages: [
        { role: 'assistant', content: 'Hmm', stopReason: null },
      ],
      sessions: [],
    });

    const result = await executor.spawn('Task');
    expect(result.output).toBe('Gone session output');
  });

  // ── Task 1 tests: getSessionInfo detects timeout/killed ──

  it('detects gateway-side timeout via sessions_list status and returns output when complete', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-timeout-complete',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Completed before timeout' }),
          );
        }
      },
      historyMessages: [
        { role: 'assistant', content: 'Done', stopReason: 'timeout' },
      ],
      sessions: [
        { key: 'sess-timeout-complete', totalTokens: 4000, status: 'timeout' },
      ],
    });

    const result = await executor.spawn('Task');
    expect(result.output).toContain('Completed before timeout');
    expect(result.tokens).toBe(4000);
  });

  it('throws SpawnTimeoutError on gateway-side timeout when no output file exists', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-timeout-nofile',
      historyMessages: [
        { role: 'assistant', content: 'Working...', stopReason: 'timeout' },
      ],
      sessions: [
        { key: 'sess-timeout-nofile', totalTokens: 1000, status: 'timeout' },
      ],
    });

    await expect(executor.spawn('Task')).rejects.toThrow(SpawnTimeoutError);
  });

  it('detects killed session as completed (not timed out)', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-killed',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Killed session output' }),
          );
        }
      },
      sessions: [{ key: 'sess-killed', totalTokens: 2000, status: 'killed' }],
    });

    const result = await executor.spawn('Task');
    expect(result.output).toContain('Killed session output');
    expect(result.tokens).toBe(2000);
  });

  // ── Task 2 test: safety-valve fires when gateway timeout is 0 ──

  it('throws SpawnTimeoutError from safety-valve when gateway reports no timeout', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    // Mock Date.now to advance 10s on each call — deterministic, no real-time dependency.
    // Safety valve = 1s + 60s = 61s buffer. After ~7 Date.now calls we exceed it.
    const startTime = Date.now();
    let callCount = 0;
    vi.spyOn(Date, 'now').mockImplementation(
      () => startTime + callCount++ * 10_000,
    );

    // Return a small timeout so safety valve = 1s + 60s = 61s
    installMock({
      sessionKey: 'sess-safety',
      statusDetails: { runTimeoutSeconds: 1 },
      historyMessages: [],
      sessions: [{ key: 'sess-safety', status: 'running' }],
    });

    await expect(executor.spawn('Task')).rejects.toThrow(SpawnTimeoutError);
  });

  it('falls back to message content when no staging file is written', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-fallback',
      historyMessages: [
        {
          role: 'assistant',
          content: 'Fallback output text',
          stopReason: 'endTurn',
        },
      ],
      sessions: [{ key: 'sess-fallback', status: 'done' }],
      // no onHistory — staging file is never written
    });

    const result = await executor.spawn('Task');
    expect(result.output).toBe('Fallback output text');
  });

  it('detects timeout from history stopReason even when sessions_list status is not timeout', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-history-timeout',
      historyMessages: [
        {
          role: 'assistant',
          content: 'Ran out of time',
          stopReason: 'timeout',
        },
      ],
      sessions: [{ key: 'sess-history-timeout', status: 'done' }],
      // no staging file — timedOut union fires on history side
    });

    await expect(executor.spawn('Task')).rejects.toThrow(SpawnTimeoutError);
  });

  it('falls back to default safety valve when session_status query fails', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    const sessionKey = 'sess-status-fail';
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const tool = body.tool as string;

      if (tool === 'session_status') {
        return Promise.reject(new Error('session_status unavailable'));
      }
      if (tool === 'sessions_spawn') {
        return jsonResponse({
          ok: true,
          result: { details: { childSessionKey: sessionKey } },
        });
      }
      if (tool === 'sessions_history') {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Status fail fallback output' }),
          );
        }
        return jsonResponse({
          ok: true,
          result: {
            details: {
              messages: [
                {
                  role: 'assistant',
                  content: 'ANNOUNCE_SKIP',
                  stopReason: 'endTurn',
                },
              ],
            },
          },
        });
      }
      if (tool === 'sessions_list') {
        return jsonResponse({
          ok: true,
          result: {
            details: {
              sessions: [{ key: sessionKey, status: 'done', totalTokens: 100 }],
            },
          },
        });
      }
      return jsonResponse({ ok: true });
    });

    const result = await executor.spawn('Task');
    expect(result.output).toContain('Status fail fallback output');
  });

  it('cleans up staging file after successful read', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    installMock({
      sessionKey: 'sess-cleanup',
      onHistory: () => {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Cleanup test output' }),
          );
        }
      },
      sessions: [{ key: 'sess-cleanup', status: 'done', totalTokens: 100 }],
    });

    await executor.spawn('Task');

    const outputPath = findOutputPath();
    expect(outputPath).toBeDefined();
    expect(existsSync(outputPath!)).toBe(false);
  });

  // ── Issue #202: staging file retry loop ──

  it('retries staging file read when file not immediately visible after completion', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
      stagingRetries: 5,
      stagingRetryDelayMs: 99, // unique value — distinguishable from pollIntervalMs
    });

    let stagingFileWritten = false;
    let retrySleepCount = 0;

    // Override sleepAsync: write the file when the 2nd staging retry sleep fires
    const sleepMock = vi.mocked(sleepAsync);
    sleepMock.mockImplementation(async (ms?: number) => {
      if (ms === 99) {
        retrySleepCount++;
        if (retrySleepCount >= 2 && !stagingFileWritten) {
          const op = findOutputPath();
          if (op) {
            writeFileSync(op, JSON.stringify({ _content: 'Retry output' }));
            stagingFileWritten = true;
          }
        }
      }
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    installMock({
      sessionKey: 'sess-staging-retry',
      sessions: [
        { key: 'sess-staging-retry', totalTokens: 300, status: 'done' },
      ],
      // No onHistory — staging file not written during poll
    });

    const result = await executor.spawn('Task');
    expect(result.output).toContain('Retry output');
    expect(retrySleepCount).toBeGreaterThanOrEqual(2);

    // Restore default mock
    sleepMock.mockImplementation(
      () => new Promise<void>((r) => setTimeout(r, 0)),
    );
  });

  it('falls back to message text after exhausting all staging retries', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
      stagingRetries: 3,
      stagingRetryDelayMs: 0,
    });

    installMock({
      sessionKey: 'sess-retry-exhaust',
      historyMessages: [
        {
          role: 'assistant',
          content: 'Exhausted retry fallback',
          stopReason: 'endTurn',
        },
      ],
      sessions: [{ key: 'sess-retry-exhaust', status: 'done' }],
      // No onHistory — staging file never written
    });

    const result = await executor.spawn('Task');
    expect(result.output).toBe('Exhausted retry fallback');
  });

  it('falls back immediately when stagingRetries is 0 (no retry iterations)', async () => {
    // With stagingRetries: 0, the executor performs the initial unconditional read,
    // finds no file, executes the loop 0 times, then falls back to message content.
    // This explicitly tests the SOLID/DRY refactor where the initial read now
    // precedes the loop and the loop only fires when that first read misses.
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
      stagingRetries: 0,
      stagingRetryDelayMs: 9999, // would be observable if the loop ran
    });

    const sleepMock = vi.mocked(sleepAsync);
    const retrySleepcalls: (number | undefined)[] = [];
    sleepMock.mockImplementation(async (ms?: number) => {
      if (ms === 9999) retrySleepcalls.push(ms);
      await new Promise<void>((r) => setTimeout(r, 0));
    });

    installMock({
      sessionKey: 'sess-zero-retries',
      historyMessages: [
        {
          role: 'assistant',
          content: 'Zero-retry fallback',
          stopReason: 'endTurn',
        },
      ],
      sessions: [{ key: 'sess-zero-retries', status: 'done' }],
      // No onHistory — staging file never written
    });

    const result = await executor.spawn('Task');
    // Must fall back to message content
    expect(result.output).toBe('Zero-retry fallback');
    // Retry delay must never have been called (loop ran 0 times)
    expect(retrySleepcalls).toHaveLength(0);

    // Restore default mock
    sleepMock.mockImplementation(
      () => new Promise<void>((r) => setTimeout(r, 0)),
    );
  });

  it('continues polling when sessions_list throws transiently', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    const sessionKey = 'sess-transient';
    let sessionsListCallCount = 0;

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      const tool = body.tool as string;

      if (tool === 'session_status') {
        return jsonResponse({ ok: true, result: { details: {} } });
      }
      if (tool === 'sessions_spawn') {
        return jsonResponse({
          ok: true,
          result: { details: { childSessionKey: sessionKey } },
        });
      }
      if (tool === 'sessions_history') {
        const op = findOutputPath();
        if (op && !existsSync(op)) {
          writeFileSync(
            op,
            JSON.stringify({ _content: 'Transient recovery output' }),
          );
        }
        return jsonResponse({
          ok: true,
          result: {
            details: {
              messages: [
                { role: 'assistant', content: 'Working...', stopReason: null },
              ],
            },
          },
        });
      }
      if (tool === 'sessions_list') {
        sessionsListCallCount++;
        if (sessionsListCallCount === 1) {
          return Promise.reject(new Error('transient network failure'));
        }
        return jsonResponse({
          ok: true,
          result: {
            details: {
              sessions: [{ key: sessionKey, status: 'done', totalTokens: 200 }],
            },
          },
        });
      }
      return jsonResponse({ ok: true });
    });

    const result = await executor.spawn('Task');
    expect(result.output).toContain('Transient recovery output');
  });
});
