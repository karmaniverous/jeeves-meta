/**
 * Tests for GatewayExecutor.
 *
 * Covers: successful spawn, timeout with SpawnTimeoutError, and abort
 * with SpawnAbortedError. All gateway HTTP calls are mocked.
 *
 * @module executor/GatewayExecutor.test
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('GatewayExecutor.spawn', () => {
  it('returns output from file-based staging on successful completion', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    const invokeSessionKeys: string[] = [];

    // Mock sessions_spawn → returns sessionKey
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;

      if (typeof body.sessionKey === 'string') {
        invokeSessionKeys.push(body.sessionKey);
      }

      if (body.tool === 'sessions_spawn') {
        return jsonResponse({
          ok: true,
          result: { details: { childSessionKey: 'test-session-1' } },
        });
      }

      if (body.tool === 'sessions_history') {
        // Write the output file to simulate the sub-agent writing it
        const spawnBody = mockFetch.mock.calls[0]?.[1] as RequestInit;
        const spawnArgs = (
          JSON.parse(spawnBody.body as string) as Record<string, unknown>
        ).args as Record<string, unknown>;
        const task = spawnArgs.task as string;
        const pathMatch = task.match(
          /Write tool at:\n(.+?output-[a-f0-9-]+\.json)/,
        );
        if (pathMatch?.[1] && !existsSync(pathMatch[1])) {
          writeFileSync(
            pathMatch[1],
            JSON.stringify({ _content: 'Test synthesis output' }),
          );
        }

        return jsonResponse({
          ok: true,
          result: {
            details: {
              messages: [
                {
                  role: 'assistant',
                  content: 'Done',
                  stopReason: 'endTurn',
                },
              ],
            },
          },
        });
      }

      if (body.tool === 'sessions_list') {
        return jsonResponse({
          ok: true,
          result: {
            details: {
              sessions: [{ key: 'test-session-1', totalTokens: 5000 }],
            },
          },
        });
      }

      return jsonResponse({ ok: true });
    });

    const result = await executor.spawn('Test task', { timeout: 30 });

    expect(result.output).toContain('Test synthesis output');
    expect(result.tokens).toBe(5000);
    expect(invokeSessionKeys.length).toBeGreaterThan(0);
    expect(new Set(invokeSessionKeys).size).toBe(1);
    expect(invokeSessionKeys[0]).toMatch(/^agent:main:meta-invoke:/);
  });

  it('throws SpawnTimeoutError when deadline exceeded', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 10,
      workspaceDir: testDir,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;

      if (body.tool === 'sessions_spawn') {
        return jsonResponse({
          ok: true,
          result: { details: { childSessionKey: 'test-session-2' } },
        });
      }

      // Always return in-progress (no terminal stopReason)
      if (body.tool === 'sessions_history') {
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

      return jsonResponse({ ok: true });
    });

    await expect(executor.spawn('Task', { timeout: 1 })).rejects.toThrow(
      SpawnTimeoutError,
    );
  });

  it('throws SpawnAbortedError when abort() is called', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      pollIntervalMs: 50,
      workspaceDir: testDir,
    });

    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string) as Record<string, unknown>;

      if (body.tool === 'sessions_spawn') {
        return jsonResponse({
          ok: true,
          result: { details: { childSessionKey: 'test-session-3' } },
        });
      }

      // Return in-progress so the polling loop runs
      if (body.tool === 'sessions_history') {
        return jsonResponse({
          ok: true,
          result: {
            details: {
              messages: [{ role: 'user', content: 'hi' }],
            },
          },
        });
      }

      return jsonResponse({ ok: true });
    });

    // Abort after the spawn call but before polling completes
    const promise = executor.spawn('Task', { timeout: 30 });

    // Give it time to enter the polling loop
    await new Promise((r) => setTimeout(r, 100));
    executor.abort();

    await expect(promise).rejects.toThrow(SpawnAbortedError);
  });

  it('throws on gateway HTTP error during spawn', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      workspaceDir: testDir,
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: 'Unauthorized' }, 401),
    );

    await expect(executor.spawn('Task')).rejects.toThrow('HTTP 401');
  });

  it('throws when sessions_spawn returns no sessionKey', async () => {
    const executor = new GatewayExecutor({
      gatewayUrl: 'http://localhost:18789',
      workspaceDir: testDir,
    });

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ ok: true, result: { details: {} } }),
    );

    await expect(executor.spawn('Task')).rejects.toThrow(
      'returned no sessionKey',
    );
  });
});
