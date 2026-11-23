/**
 * Tests for orchestratePhase: the queued meta runs the phase the scheduler
 * selected for it (#249).
 *
 * @module orchestrator/orchestratePhase.test
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import type { MetaEntry } from '../discovery/listMetas.js';
import type { MetaExecutor, WatcherClient } from '../interfaces/index.js';
import type { MinimalLogger } from '../logger/index.js';
import { normalizePath } from '../normalizePath.js';
import {
  buildPhaseCandidates,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import type { MetaConfig } from '../schema/config.js';
import type { MetaJson } from '../schema/meta.js';
import { orchestratePhase } from './orchestratePhase.js';

const config: MetaConfig = {
  watcherUrl: 'http://localhost:3456',
  gatewayUrl: 'http://127.0.0.1:18789',
  architectEvery: 10,
  depthWeight: 0.5,
  maxArchive: 20,
  maxLines: 500,
  thinking: 'low',
  skipUnchanged: true,
  metaProperty: { _meta: 'current' },
  metaArchiveProperty: { _meta: 'archive' },
};

/** A meta whose persisted _phaseState is fully fresh. */
function freshMeta(synthesisCount: number): MetaJson {
  return {
    _id: '22222222-2222-2222-2222-222222222222',
    _builder: 'Previous builder brief',
    _content: '# Previous synthesis',
    _generatedAt: new Date(Date.now() - 3600_000).toISOString(),
    _synthesisCount: synthesisCount,
    _phaseState: { architect: 'fresh', builder: 'fresh', critic: 'fresh' },
  };
}

type LogFn = MinimalLogger['warn'];

function makeLogger(): MinimalLogger & { warn: Mock<LogFn> } {
  return {
    debug: vi.fn<LogFn>(),
    info: vi.fn<LogFn>(),
    warn: vi.fn<LogFn>(),
    error: vi.fn<LogFn>(),
  };
}

describe('orchestratePhase', () => {
  let testRoot: string;
  let metaPath: string;
  let watcher: WatcherClient;
  let spawn: Mock<MetaExecutor['spawn']>;
  let executor: MetaExecutor;

  function writeMeta(meta: MetaJson): void {
    mkdirSync(metaPath, { recursive: true });
    writeFileSync(join(metaPath, 'meta.json'), JSON.stringify(meta, null, 2));
  }

  function readMeta(): MetaJson {
    return JSON.parse(
      readFileSync(join(metaPath, 'meta.json'), 'utf8'),
    ) as MetaJson;
  }

  beforeEach(() => {
    testRoot = join(
      tmpdir(),
      `jeeves-orchestrate-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
    );
    metaPath = normalizePath(join(testRoot, 'mailbox', '.meta'));
    watcher = {
      walk: vi.fn().mockResolvedValue([]),
      registerRules: vi.fn().mockResolvedValue(undefined),
      scan: vi.fn().mockResolvedValue({ points: [] }),
    };
    spawn = vi.fn<MetaExecutor['spawn']>().mockResolvedValue({
      output: 'Fresh builder brief',
      tokens: 100,
    });
    executor = { spawn };
  });

  afterEach(() => {
    rmSync(testRoot, { recursive: true, force: true });
  });

  it('runs the architect phase Tier 1 selected for a meta at architectEvery', async () => {
    const meta = freshMeta(config.architectEvery);
    writeMeta(meta);

    // Selection: the scheduler's Tier 1 picks this meta for architect.
    const entry: MetaEntry = {
      path: metaPath,
      depth: 0,
      emphasis: 1,
      stalenessSeconds: 3600,
      lastSynthesized: meta._generatedAt ?? null,
      hasError: false,
      locked: false,
      disabled: false,
      architectTokens: null,
      builderTokens: null,
      criticTokens: null,
      children: 0,
      node: {
        metaPath,
        ownerPath: normalizePath(join(testRoot, 'mailbox')),
        treeDepth: 0,
        children: [],
        parent: null,
      },
      meta,
    };
    const winner = selectPhaseCandidate(
      buildPhaseCandidates([entry], config.architectEvery),
      config.depthWeight,
    );
    expect(winner?.owedPhase).toBe('architect');

    // Execution: the queued path runs that phase, though disk says fresh.
    const logger = makeLogger();
    const result = await orchestratePhase(
      config,
      executor,
      watcher,
      metaPath,
      undefined,
      logger,
    );

    expect(result.executed).toBe(true);
    expect(result.phase).toBe('architect');
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();

    const after = readMeta();
    expect(after._synthesisCount).toBe(0);
    expect(after._builder).toBe('Fresh builder brief');
    expect(after._phaseState).toEqual({
      architect: 'fresh',
      builder: 'pending',
      critic: 'stale',
    });
  });

  it('drops a fully-fresh queued meta with a warning', async () => {
    writeMeta(freshMeta(config.architectEvery - 1));

    const logger = makeLogger();
    const result = await orchestratePhase(
      config,
      executor,
      watcher,
      metaPath,
      undefined,
      logger,
    );

    expect(result.executed).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ path: expect.any(String) as string }),
      'Queued meta owes no phase, dropped',
    );
  });
});
