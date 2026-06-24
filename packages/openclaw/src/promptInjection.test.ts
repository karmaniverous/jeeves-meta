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

/** Default watcher dependency health for test fixtures. */
const defaultWatcher = {
  url: 'http://127.0.0.1:1936',
  status: 'ok',
  checkedAt: '2026-03-15T00:00:00Z',
  rulesRegistered: true,
} as const;

/** Default gateway dependency health for test fixtures. */
const defaultGateway = {
  url: 'http://127.0.0.1:18789',
  status: 'ok',
  checkedAt: '2026-03-15T00:00:00Z',
} as const;

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
        watcher: { ...defaultWatcher },
        gateway: { ...defaultGateway },
      },
    },
  };

  const defaultMetas: MetasResponse = {
    summary: {
      total: 10,
      stale: 5,
      errors: 0,
      locked: 0,
      disabled: 0,
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
            watcher: { ...defaultWatcher, rulesRegistered: false },
            gateway: { ...defaultGateway },
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
            watcher: {
              ...defaultWatcher,
              status: 'unreachable',
              rulesRegistered: false,
            },
            gateway: { ...defaultGateway },
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
              ...defaultWatcher,
              status: 'indexing',
              indexing: true,
            },
            gateway: { ...defaultGateway },
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
          locked: 0,
          disabled: 0,
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
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway, status: 'unreachable' },
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
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Phases:');
    // Fresh is aggregated across all phases (8+7+9=24)
    expect(menu).toContain('24 fresh');
    // Non-fresh show per-phase breakdown
    expect(menu).toContain('2 pending architect');
    expect(menu).toContain('1 pending builder');
    expect(menu).toContain('1 running builder');
    expect(menu).toContain('1 stale builder');
    expect(menu).toContain('1 failed critic');
    // Old aggregated format not present
    expect(menu).not.toMatch(/\d+ pending,/);
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
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway },
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
    expect(menu).toContain('⚠ Failed:');
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
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('Next:');
    expect(menu).toContain('j:/domains/email/.meta');
    expect(menu).toContain('architect');
    expect(menu).toContain('band 3');
    // 172800s = exactly 2 days
    expect(menu).toContain('staleness 2d)');
  });

  it('omits phase sections when no phaseStateSummary in health', async () => {
    const client = mockClient();
    const menu = await generateMetaMenu(client);
    expect(menu).not.toContain('Phase State');
    expect(menu).not.toContain('Failed:');
    expect(menu).not.toContain('Next:');
  });

  // ── Issue #187: compound interval format ──

  it('formats staleness with compound day+hour intervals', async () => {
    const allFreshHealth = {
      phaseStateSummary: {
        architect: { fresh: 1, stale: 0, pending: 0, running: 0, failed: 0 },
        builder: { fresh: 1, stale: 0, pending: 0, running: 0, failed: 0 },
        critic: { fresh: 1, stale: 0, pending: 0, running: 0, failed: 0 },
      },
      nextPhase: {
        path: 'j:/domains/test/.meta',
        phase: 'architect' as const,
        band: 1,
        staleness: 97200, // 1 day + 3 hours
      },
      dependencies: {
        watcher: { ...defaultWatcher },
        gateway: { ...defaultGateway },
      },
    };
    const client = mockClient({
      statusOverrides: { health: allFreshHealth },
      metasOverrides: {
        metas: [{ stalenessSeconds: 5400 }], // 1h 30m
      },
    });
    const menu = await generateMetaMenu(client);
    // Next phase staleness: 97200s = 1d 3h
    expect(menu).toContain('staleness 1d 3h)');
    // Stalest display: 5400s = 1h 30m
    expect(menu).toContain('1h 30m');
  });

  it('formats hour+minute intervals correctly', async () => {
    const client = mockClient({
      statusOverrides: {
        health: {
          phaseStateSummary: {
            architect: {
              fresh: 1,
              stale: 0,
              pending: 0,
              running: 0,
              failed: 0,
            },
            builder: { fresh: 1, stale: 0, pending: 0, running: 0, failed: 0 },
            critic: { fresh: 1, stale: 0, pending: 0, running: 0, failed: 0 },
          },
          nextPhase: {
            path: 'j:/domains/test/.meta',
            phase: 'builder' as const,
            band: 2,
            staleness: 5700, // 1h 35m
          },
          dependencies: {
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway },
          },
        },
      },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('staleness 1h 35m)');
  });

  // ── Issue #185: failed-entity overflow (>10) test coverage ──

  it('truncates failed-phase list with (+N more) when more than 10 entries', async () => {
    // Build 12 failed metas to trigger the overflow branch
    const failedMetas = Array.from({ length: 12 }, (_, i) => ({
      stalenessSeconds: 100,
      path: `j:/domains/test-${(i + 1).toString()}/.meta`,
      phaseState: {
        architect: 'failed' as const,
        builder: 'fresh' as const,
        critic: 'fresh' as const,
      },
    }));

    const client = mockClient({
      statusOverrides: {
        health: {
          phaseStateSummary: {
            architect: {
              fresh: 0,
              stale: 0,
              pending: 0,
              running: 0,
              failed: 12,
            },
            builder: { fresh: 12, stale: 0, pending: 0, running: 0, failed: 0 },
            critic: { fresh: 12, stale: 0, pending: 0, running: 0, failed: 0 },
          },
          nextPhase: null,
          dependencies: {
            watcher: { ...defaultWatcher },
            gateway: { ...defaultGateway },
          },
        },
      },
      metasOverrides: { metas: failedMetas },
    });
    const menu = await generateMetaMenu(client);
    expect(menu).toContain('⚠ Failed:');
    // First 10 entries shown, +2 overflow
    expect(menu).toContain('(+2 more)');
    // Verify some of the first 10 entries are shown
    expect(menu).toContain('j:/domains/test-1/.meta (architect)');
    expect(menu).toContain('j:/domains/test-10/.meta (architect)');
    // Entry 11 and 12 should NOT appear directly
    expect(menu).not.toContain('j:/domains/test-11/.meta');
    expect(menu).not.toContain('j:/domains/test-12/.meta');
  });
});
