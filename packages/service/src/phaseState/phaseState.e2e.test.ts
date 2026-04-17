/**
 * End-to-end smoke test for the phase-state machine.
 *
 * Builds a fixture corpus (tmp dir with 2-3 meta.json files in various states),
 * mocks the executor, drives multiple orchestratePhase() calls through the
 * corpus, and verifies behavioral contracts.
 *
 * Covers Task #19: end-to-end smoke test.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MetaNode } from '../discovery/types.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import { acquireLock, releaseLock } from '../lock.js';
import {
  runArchitect,
  runBuilder,
  runCritic,
} from '../orchestrator/runPhase.js';
import type { MetaConfig } from '../schema/config.js';
import type { MetaJson } from '../schema/meta.js';
import { derivePhaseState } from './derivePhaseState.js';
import { selectPhaseCandidate } from './phaseScheduler.js';
import { getOwedPhase, isFullyFresh, phaseFailed } from './phaseTransitions.js';

/**
 * Helper: create a fixture meta directory with meta.json.
 */
function createFixtureMeta(
  rootDir: string,
  name: string,
  meta: MetaJson,
): { metaPath: string; node: MetaNode } {
  const ownerPath = join(rootDir, name);
  const metaPath = join(ownerPath, '.meta');
  mkdirSync(metaPath, { recursive: true });
  writeFileSync(join(metaPath, 'meta.json'), JSON.stringify(meta, null, 2));
  return {
    metaPath,
    node: {
      metaPath,
      ownerPath,
      treeDepth: 0,
      children: [],
      parent: null,
    },
  };
}

function readDiskMeta(metaPath: string): MetaJson {
  return JSON.parse(
    readFileSync(join(metaPath, 'meta.json'), 'utf8'),
  ) as MetaJson;
}

const baseConfig: MetaConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:18789',
  architectEvery: 10,
  depthWeight: 0.5,
  maxArchive: 20,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  thinking: 'low',
  defaultArchitect: '',
  defaultCritic: '',
  skipUnchanged: true,
  metaProperty: { _meta: 'current' },
  metaArchiveProperty: { _meta: 'archive' },
};

describe('phase-state e2e smoke test (Task #19)', () => {
  let testRoot: string;
  let mockWatcher: WatcherClient;

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `jeeves-phase-e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testRoot, { recursive: true });

    mockWatcher = {
      walk: vi.fn().mockResolvedValue([]),
      registerRules: vi.fn().mockResolvedValue(undefined),
      scan: vi.fn().mockResolvedValue({ points: [] }),
    } as unknown as WatcherClient;
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('drives a full cycle: architect → builder → critic → archive', async () => {
    // Create a never-synthesized meta
    const { metaPath, node } = createFixtureMeta(testRoot, 'project-a', {
      _id: '11111111-1111-1111-1111-111111111111',
    });

    const mockExecutor: MetaExecutor = {
      spawn: vi
        .fn()
        .mockResolvedValueOnce({
          output: 'Analyze the codebase for patterns',
          tokens: 100,
        })
        .mockResolvedValueOnce({
          output: JSON.stringify({
            _content: '# Project A Synthesis\n\nKey findings...',
          }),
          tokens: 200,
        })
        .mockResolvedValueOnce({
          output: 'Synthesis is comprehensive and accurate.',
          tokens: 50,
        }),
    };

    // Phase 1: Architect
    let meta = readDiskMeta(metaPath);
    let ps = derivePhaseState(meta);
    expect(getOwedPhase(ps)).toBe('architect');

    acquireLock(metaPath);
    let result = await runArchitect(
      node,
      meta,
      ps,
      baseConfig,
      mockExecutor,
      mockWatcher,
      'hash1',
    );
    releaseLock(metaPath);

    expect(result.executed).toBe(true);
    expect(result.phaseState.architect).toBe('fresh');

    // Phase 2: Builder
    meta = readDiskMeta(metaPath);
    ps = derivePhaseState(meta);
    expect(getOwedPhase(ps)).toBe('builder');

    acquireLock(metaPath);
    result = await runBuilder(
      node,
      meta,
      ps,
      baseConfig,
      mockExecutor,
      mockWatcher,
      'hash1',
    );
    releaseLock(metaPath);

    expect(result.executed).toBe(true);
    expect(result.phaseState.builder).toBe('fresh');

    // Phase 3: Critic
    meta = readDiskMeta(metaPath);
    ps = derivePhaseState(meta);
    expect(getOwedPhase(ps)).toBe('critic');

    acquireLock(metaPath);
    result = await runCritic(
      node,
      meta,
      ps,
      baseConfig,
      mockExecutor,
      mockWatcher,
      'hash1',
    );
    releaseLock(metaPath);

    expect(result.cycleComplete).toBe(true);
    expect(isFullyFresh(result.phaseState)).toBe(true);

    // Verify archive was created
    const archiveDir = join(metaPath, 'archive');
    expect(existsSync(archiveDir)).toBe(true);
    const archiveFiles = readdirSync(archiveDir).filter((f) =>
      f.endsWith('.json'),
    );
    expect(archiveFiles.length).toBe(1);

    // Verify _synthesisCount incremented
    meta = readDiskMeta(metaPath);
    expect(meta._synthesisCount).toBe(1);
  });

  it('surgical retry only re-runs the failed phase', async () => {
    // Create a meta where builder has failed
    const { metaPath, node } = createFixtureMeta(testRoot, 'project-b', {
      _id: '22222222-2222-2222-2222-222222222222',
      _builder: 'cached brief',
      _generatedAt: new Date().toISOString(),
      _phaseState: {
        architect: 'fresh',
        builder: 'failed',
        critic: 'stale',
      },
      _error: { step: 'builder', code: 'TIMEOUT', message: 'Timed out' },
    });

    const spawnMock = vi.fn().mockResolvedValue({
      output: JSON.stringify({
        _content: '# Retry output\n\nRecovered content.',
      }),
      tokens: 150,
    });
    const mockExecutor: MetaExecutor = { spawn: spawnMock };

    // Derive state — should show builder failed
    let meta = readDiskMeta(metaPath);
    let ps = derivePhaseState(meta);
    expect(ps.builder).toBe('failed');

    // Retry: builder should be re-eligible
    const { retryPhase } = await import('./phaseTransitions.js');
    ps = retryPhase(ps, 'builder');
    expect(ps.builder).toBe('pending');
    expect(getOwedPhase(ps)).toBe('builder');

    // Run builder retry
    acquireLock(metaPath);
    const result = await runBuilder(
      node,
      meta,
      ps,
      baseConfig,
      mockExecutor,
      mockWatcher,
      'hash1',
    );
    releaseLock(metaPath);

    expect(result.executed).toBe(true);
    expect(result.phaseState.builder).toBe('fresh');
    expect(result.phaseState.critic).toBe('pending');

    // Verify architect was NOT called (only builder)
    expect(spawnMock).toHaveBeenCalledTimes(1);

    // Verify _error is cleared on disk
    meta = readDiskMeta(metaPath);
    expect(meta._error).toBeUndefined();
  });

  it('abort sets _error.code=ABORT on disk', async () => {
    const { metaPath } = createFixtureMeta(testRoot, 'project-c', {
      _id: '33333333-3333-3333-3333-333333333333',
      _builder: 'brief',
      _content: 'existing content',
      _generatedAt: new Date().toISOString(),
      _phaseState: {
        architect: 'fresh',
        builder: 'running',
        critic: 'stale',
      },
    });

    acquireLock(metaPath);

    // Simulate abort handler behavior
    const meta = readDiskMeta(metaPath);
    const ps = phaseFailed(meta._phaseState!, 'builder');

    const updated = {
      ...meta,
      _phaseState: ps,
      _error: {
        step: 'builder' as const,
        code: 'ABORT',
        message: 'Aborted by operator',
      },
    };

    const lockPath = join(metaPath, '.lock');
    const metaJsonPath = join(metaPath, 'meta.json');
    await writeFile(lockPath, JSON.stringify(updated, null, 2) + '\n');
    await copyFile(lockPath, metaJsonPath);
    releaseLock(metaPath);

    // Verify on disk
    const onDisk = readDiskMeta(metaPath);
    expect(onDisk._error!.code).toBe('ABORT');
    expect(onDisk._error!.message).toBe('Aborted by operator');
    expect(onDisk._phaseState!.builder).toBe('failed');
    expect(onDisk._phaseState!.architect).toBe('fresh');
  });

  it('derive + select reflect correct state after each cycle', () => {
    // Create 3 metas in various states
    const metaA = createFixtureMeta(testRoot, 'a', {
      _id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    const metaB = createFixtureMeta(testRoot, 'b', {
      _id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      _builder: 'brief',
      _content: 'content',
      _feedback: 'good',
      _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
      _phaseState: {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'fresh',
      },
    });
    const metaC = createFixtureMeta(testRoot, 'c', {
      _id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      _builder: 'brief',
      _generatedAt: new Date(Date.now() - 7200_000).toISOString(),
      _phaseState: {
        architect: 'fresh',
        builder: 'fresh',
        critic: 'pending',
      },
    });

    // Build candidates for scheduler
    const candidates = [
      {
        node: metaA.node,
        meta: readDiskMeta(metaA.metaPath),
        phaseState: derivePhaseState(readDiskMeta(metaA.metaPath)),
        actualStaleness: 365 * 86400, // never synthesized
        locked: false,
        disabled: false,
      },
      {
        node: metaB.node,
        meta: readDiskMeta(metaB.metaPath),
        phaseState: derivePhaseState(readDiskMeta(metaB.metaPath)),
        actualStaleness: 3600,
        locked: false,
        disabled: false,
      },
      {
        node: metaC.node,
        meta: readDiskMeta(metaC.metaPath),
        phaseState: derivePhaseState(readDiskMeta(metaC.metaPath)),
        actualStaleness: 7200,
        locked: false,
        disabled: false,
      },
    ];

    // Scheduler should pick metaC (pending critic = band 1, highest priority)
    const winner = selectPhaseCandidate(candidates, 0.5);
    expect(winner).not.toBeNull();
    expect(winner!.owedPhase).toBe('critic');
    expect(winner!.band).toBe(1);
    expect(winner!.node.metaPath).toBe(metaC.metaPath);

    // metaB is fully fresh — should not be selected
    expect(isFullyFresh(candidates[1].phaseState)).toBe(true);

    // metaA is never-synthesized — should be architect band 3
    expect(candidates[0].phaseState.architect).toBe('pending');
    expect(getOwedPhase(candidates[0].phaseState)).toBe('architect');
  });
});
