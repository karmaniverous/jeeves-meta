import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SpawnTimeoutError } from '../executor/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { attemptTimeoutRecovery } from './timeoutRecovery.js';

const config: MetaConfig = {
  watcherUrl: 'x',
  gatewayUrl: 'x',
  depthWeight: 1,
  architectEvery: 10,
  maxArchive: 5,
  maxLines: 500,
  architectTimeout: 120,
  builderTimeout: 600,
  criticTimeout: 300,
  thinking: 'low',
  defaultArchitect: 'a',
  defaultCritic: 'c',
  skipUnchanged: true,
  metaProperty: {},
  metaArchiveProperty: {},
};

let testRoot: string;
let metaPath: string;

function baseMeta(overrides: Partial<MetaJson> = {}): MetaJson {
  return {
    _id: '550e8400-e29b-41d4-a716-446655440000',
    _generatedAt: '2024-01-01T00:00:00.000Z',
    _structureHash: 'abc',
    _synthesisCount: 1,
    _content: 'existing content',
    _architect: 'arch-prompt',
    _builder: 'build-brief',
    _critic: 'critic-prompt',
    ...overrides,
  };
}

function baseOpts(err: SpawnTimeoutError, currentMeta?: MetaJson) {
  return {
    err,
    currentMeta: currentMeta ?? baseMeta(),
    metaPath,
    config,
    builderBrief: 'build-brief',
    structureHash: 'hash123',
    synthesisCount: 2,
  };
}

beforeEach(() => {
  testRoot = join(
    tmpdir(),
    `jeeves-timeout-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  metaPath = join(testRoot, '.meta');
  mkdirSync(metaPath, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('attemptTimeoutRecovery', () => {
  it('returns null when output file does not exist', async () => {
    const err = new SpawnTimeoutError(
      'timed out',
      join(testRoot, 'nonexistent.json'),
    );
    const result = await attemptTimeoutRecovery(baseOpts(err));
    expect(result).toBeNull();
  });

  it('returns null when partial output has no _state', async () => {
    const outputPath = join(testRoot, 'partial.json');
    writeFileSync(outputPath, JSON.stringify({ _content: 'partial' }));

    const err = new SpawnTimeoutError('timed out', outputPath);
    const result = await attemptTimeoutRecovery(baseOpts(err));
    expect(result).toBeNull();
  });

  it('returns null when _state is unchanged', async () => {
    const outputPath = join(testRoot, 'partial.json');
    writeFileSync(
      outputPath,
      JSON.stringify({ _content: 'x', _state: { step: 1 } }),
    );

    const err = new SpawnTimeoutError('timed out', outputPath);
    const currentMeta = baseMeta({ _state: { step: 1 } });
    const result = await attemptTimeoutRecovery(baseOpts(err, currentMeta));
    expect(result).toBeNull();
  });

  it('returns OrchestrateResult when _state advanced', async () => {
    const outputPath = join(testRoot, 'partial.json');
    writeFileSync(
      outputPath,
      JSON.stringify({ _content: 'x', _state: { step: 2 } }),
    );

    const err = new SpawnTimeoutError('timed out', outputPath);
    const currentMeta = baseMeta({ _state: { step: 1 } });
    const result = await attemptTimeoutRecovery(baseOpts(err, currentMeta));

    expect(result).not.toBeNull();
    expect(result!.synthesized).toBe(true);
    expect(result!.error?.code).toBe('TIMEOUT');
    expect(result!.metaPath).toBe(metaPath);
  });

  it('returns null when file read throws', async () => {
    // Use a directory path — readFile will throw EISDIR
    const dirPath = join(testRoot, 'a-dir');
    mkdirSync(dirPath, { recursive: true });

    const err = new SpawnTimeoutError('timed out', dirPath);
    const result = await attemptTimeoutRecovery(baseOpts(err));
    expect(result).toBeNull();
  });
});
