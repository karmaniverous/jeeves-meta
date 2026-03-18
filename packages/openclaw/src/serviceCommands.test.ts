/**
 * Tests for ServiceCommands — status mapping and error handling.
 *
 * @module serviceCommands.test
 */

import { describe, expect, it, vi } from 'vitest';

import type { MetaServiceClient, StatusResponse } from './serviceClient.js';
import { createServiceCommands } from './serviceCommands.js';

function mockClient(statusResult?: StatusResponse | Error): MetaServiceClient {
  const statusFn =
    statusResult instanceof Error
      ? vi.fn().mockRejectedValue(statusResult)
      : vi.fn().mockResolvedValue(statusResult);

  return { status: statusFn } as unknown as MetaServiceClient;
}

describe('createServiceCommands', () => {
  describe('status', () => {
    it('maps idle service to running=true with version and uptime', async () => {
      const client = mockClient({
        uptime: 3600,
        status: 'idle',
        version: '0.5.0',
        dependencies: {
          watcher: { status: 'ok' },
          gateway: { status: 'ok' },
        },
      });
      const cmds = createServiceCommands(client);
      const result = await cmds.status();
      expect(result).toEqual({
        running: true,
        version: '0.5.0',
        uptimeSeconds: 3600,
      });
    });

    it('maps synthesizing status to running=true', async () => {
      const client = mockClient({
        uptime: 120,
        status: 'synthesizing',
        dependencies: {
          watcher: { status: 'ok' },
          gateway: { status: 'ok' },
        },
      });
      const cmds = createServiceCommands(client);
      const result = await cmds.status();
      expect(result.running).toBe(true);
    });

    it('maps stopped status to running=false', async () => {
      const client = mockClient({
        uptime: 0,
        status: 'stopped',
        dependencies: {
          watcher: { status: 'ok' },
          gateway: { status: 'ok' },
        },
      });
      const cmds = createServiceCommands(client);
      const result = await cmds.status();
      expect(result.running).toBe(false);
    });

    it('returns running=false when service is unreachable', async () => {
      const client = mockClient(new Error('ECONNREFUSED'));
      const cmds = createServiceCommands(client);
      const result = await cmds.status();
      expect(result).toEqual({ running: false });
    });
  });
});
