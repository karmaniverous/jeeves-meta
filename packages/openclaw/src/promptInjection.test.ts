/**
 * Tests for TOOLS.md menu generation, including rulesRegistered warning.
 *
 * @module promptInjection.test
 */

import { describe, expect, it, vi } from 'vitest';

import { generateMetaMenu } from './promptInjection.js';
import type {
  MetaServiceClient,
  MetasResponse,
  StatusResponse,
} from './serviceClient.js';

function mockClient(overrides?: {
  statusOverrides?: Partial<StatusResponse>;
  metasOverrides?: Partial<MetasResponse>;
}): MetaServiceClient {
  const defaultStatus: StatusResponse = {
    uptime: 3600,
    status: 'idle',
    dependencies: {
      watcher: { status: 'ok', rulesRegistered: true },
      gateway: { status: 'ok' },
    },
  };

  const defaultMetas: MetasResponse = {
    summary: {
      total: 10,
      stale: 5,
      errors: 0,
      neverSynthesized: 0,
      stalestPath: 'j:/domains/email/.meta',
      lastSynthesizedPath: 'j:/domains/github/.meta',
      lastSynthesizedAt: '2026-03-15T00:00:00Z',
      tokens: { architect: 1000, builder: 2000, critic: 500 },
    },
    metas: [{ stalenessSeconds: 86400 }],
  };

  return {
    status: vi
      .fn()
      .mockResolvedValue({ ...defaultStatus, ...overrides?.statusOverrides }),
    listMetas: vi
      .fn()
      .mockResolvedValue({ ...defaultMetas, ...overrides?.metasOverrides }),
  } as unknown as MetaServiceClient;
}

describe('generateMetaMenu', () => {
  it('generates menu with entity summary', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('10 meta entities');
    expect(menu).toContain('meta_list');
  });

  it('shows warning when rulesRegistered is false', async () => {
    const client = mockClient({
      statusOverrides: {
        dependencies: {
          watcher: { status: 'ok', rulesRegistered: false },
          gateway: { status: 'ok' },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Watcher rules not registered');
  });

  it('does not show rules warning when rulesRegistered is true', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    expect(menu).not.toContain('Watcher rules not registered');
  });

  it('shows watcher status warning when watcher is down', async () => {
    const client = mockClient({
      statusOverrides: {
        dependencies: {
          watcher: { status: 'unreachable', rulesRegistered: false },
          gateway: { status: 'ok' },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('**Watcher**: unreachable');
    expect(menu).not.toContain('Watcher rules not registered');
  });

  it('shows indexing message when watcher is indexing', async () => {
    const client = mockClient({
      statusOverrides: {
        dependencies: {
          watcher: {
            status: 'indexing',
            rulesRegistered: true,
            indexing: true,
          },
          gateway: { status: 'ok' },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Watcher indexing');
    expect(menu).toContain('Initial filesystem scan in progress');
    expect(menu).not.toContain('**Watcher**: indexing');
    expect(menu).not.toContain('Watcher rules not registered');
  });

  it('returns ACTION REQUIRED when service is unreachable', async () => {
    const client = {
      status: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      listMetas: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as MetaServiceClient;
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('ACTION REQUIRED');
  });

  it('returns ACTION REQUIRED when no entities found', async () => {
    const client = mockClient({
      metasOverrides: {
        summary: {
          total: 0,
          stale: 0,
          errors: 0,
          neverSynthesized: 0,
          stalestPath: null,
          lastSynthesizedPath: null,
          lastSynthesizedAt: null,
          tokens: { architect: 0, builder: 0, critic: 0 },
        },
        metas: [],
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('ACTION REQUIRED');
    expect(menu).toContain('No synthesis entities found');
  });

  it('shows gateway warning when gateway is unreachable', async () => {
    const client = mockClient({
      statusOverrides: {
        dependencies: {
          watcher: { status: 'ok', rulesRegistered: true },
          gateway: { status: 'unreachable' },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('**Gateway**: unreachable');
  });

  it('includes all 7 tools in healthy state output', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('meta_list');
    expect(menu).toContain('meta_detail');
    expect(menu).toContain('meta_trigger');
    expect(menu).toContain('meta_preview');
    expect(menu).toContain('meta_seed');
    expect(menu).toContain('meta_unlock');
    expect(menu).toContain('meta_config');
  });
});
