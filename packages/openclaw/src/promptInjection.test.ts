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
    name: 'jeeves-meta',
    uptime: 3600,
    status: 'healthy',
    health: {
      dependencies: {
        watcher: { status: 'ok', rulesRegistered: true },
        gateway: { status: 'ok' },
      },
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
    expect(menu).toContain('jeeves-meta');
  });

  it('shows warning when rulesRegistered is false', async () => {
    const client = mockClient({
      statusOverrides: {
        health: {
          dependencies: {
            watcher: { status: 'ok', rulesRegistered: false },
            gateway: { status: 'ok' },
          },
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
        health: {
          dependencies: {
            watcher: { status: 'unreachable', rulesRegistered: false },
            gateway: { status: 'ok' },
          },
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
        health: {
          dependencies: {
            watcher: {
              status: 'indexing',
              rulesRegistered: true,
              indexing: true,
            },
            gateway: { status: 'ok' },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Watcher indexing');
    expect(menu).toContain('Initial filesystem scan in progress');
    expect(menu).not.toContain('**Watcher**: indexing');
    expect(menu).not.toContain('Watcher rules not registered');
  });

  it('throws when service is unreachable', async () => {
    const client = {
      status: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      listMetas: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as MetaServiceClient;
    await expect(generateMetaMenu(client)).rejects.toThrow('ECONNREFUSED');
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
        health: {
          dependencies: {
            watcher: { status: 'ok', rulesRegistered: true },
            gateway: { status: 'unreachable' },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('**Gateway**: unreachable');
  });

  it('does not include tool catalogue in healthy state output', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    // Tool catalogue was removed (issue #67) — tool definitions are
    // already in the system prompt via OpenClaw's native tool injection.
    expect(menu).not.toContain('| Tool |');
    expect(menu).toContain('jeeves-meta');
  });

  // ── Phase-state TOOLS.md additions (Task #18c) ──

  it('includes phase-state summary when phaseStateSummary is present', async () => {
    const client = mockClient({
      statusOverrides: {
        health: {
          phaseStateSummary: {
            architect: {
              fresh: 8,
              stale: 0,
              pending: 2,
              running: 0,
              failed: 0,
            },
            builder: { fresh: 7, stale: 1, pending: 1, running: 1, failed: 0 },
            critic: { fresh: 9, stale: 0, pending: 0, running: 0, failed: 1 },
          },
          nextPhase: null,
          dependencies: {
            watcher: { status: 'ok', rulesRegistered: true },
            gateway: { status: 'ok' },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Phases:');
    expect(menu).toContain('fresh');
    expect(menu).toContain('pending');
  });

  it('includes failed-phase alert when metas have failed phases', async () => {
    const client = mockClient({
      statusOverrides: {
        health: {
          phaseStateSummary: {
            architect: {
              fresh: 10,
              stale: 0,
              pending: 0,
              running: 0,
              failed: 0,
            },
            builder: { fresh: 9, stale: 0, pending: 0, running: 0, failed: 1 },
            critic: { fresh: 10, stale: 0, pending: 0, running: 0, failed: 0 },
          },
          nextPhase: null,
          dependencies: {
            watcher: { status: 'ok', rulesRegistered: true },
            gateway: { status: 'ok' },
          },
        },
      },
      metasOverrides: {
        metas: [
          {
            stalenessSeconds: 100,
            path: 'j:/domains/test/.meta',
            phaseState: {
              architect: 'fresh',
              builder: 'failed',
              critic: 'stale',
            },
          },
        ],
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Failed:');
    expect(menu).toContain('j:/domains/test/.meta (builder)');
  });

  it('includes next-phase indicator when nextPhase is present', async () => {
    const client = mockClient({
      statusOverrides: {
        health: {
          phaseStateSummary: {
            architect: {
              fresh: 10,
              stale: 0,
              pending: 0,
              running: 0,
              failed: 0,
            },
            builder: { fresh: 10, stale: 0, pending: 0, running: 0, failed: 0 },
            critic: { fresh: 10, stale: 0, pending: 0, running: 0, failed: 0 },
          },
          nextPhase: {
            path: 'j:/domains/email/.meta',
            phase: 'architect',
            band: 3,
            staleness: 172800,
          },
          dependencies: {
            watcher: { status: 'ok', rulesRegistered: true },
            gateway: { status: 'ok' },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Next:');
    expect(menu).toContain('j:/domains/email/.meta');
    expect(menu).toContain('architect');
    expect(menu).toContain('band 3');
  });

  it('omits phase sections when no phaseStateSummary in health', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    expect(menu).not.toContain('Phase State');
    expect(menu).not.toContain('Failed:');
    expect(menu).not.toContain('Next:');
  });
});
