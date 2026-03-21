import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listArchiveFiles } from '../archive/index.js';
import type { MetaConfig, MetaJson } from '../schema/index.js';
import { finalizeCycle } from './finalizeCycle.js';

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

function baseMeta(): MetaJson {
  return {
    _id: '550e8400-e29b-41d4-a716-446655440000',
    _generatedAt: '2024-01-01T00:00:00.000Z',
    _structureHash: 'abc',
    _synthesisCount: 1,
    _content: 'existing content',
    _architect: 'arch-prompt',
    _builder: 'build-brief',
    _critic: 'critic-prompt',
  };
}

function baseOpts() {
  return {
    metaPath,
    current: baseMeta(),
    config,
    architect: 'arch-prompt',
    builder: 'build-brief',
    critic: 'critic-prompt',
    builderOutput: { content: 'new content', fields: {} },
    feedback: 'looks good',
    structureHash: 'hash123',
    synthesisCount: 2,
    error: null,
  };
}

beforeEach(() => {
  testRoot = join(
    tmpdir(),
    `jeeves-finalize-${Date.now().toString()}-${Math.random().toString(36).slice(2)}`,
  );
  metaPath = join(testRoot, '.meta');
  mkdirSync(metaPath, { recursive: true });
});

afterEach(() => {
  rmSync(testRoot, { recursive: true, force: true });
});

describe('finalizeCycle', () => {
  it('writes .lock file then copies to meta.json', () => {
    const result = finalizeCycle(baseOpts());

    const lockPath = join(metaPath, '.lock');
    const metaJsonPath = join(metaPath, 'meta.json');

    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(metaJsonPath)).toBe(true);

    const metaOnDisk = JSON.parse(
      readFileSync(metaJsonPath, 'utf8'),
    ) as MetaJson;
    expect(metaOnDisk._content).toBe(result._content);
    expect(metaOnDisk._structureHash).toBe(result._structureHash);
    expect(metaOnDisk._synthesisCount).toBe(result._synthesisCount);
  });

  it('creates archive snapshot', () => {
    finalizeCycle(baseOpts());

    const archiveFiles = listArchiveFiles(metaPath);
    expect(archiveFiles.length).toBe(1);
  });

  it('prunes archive to maxArchive', () => {
    const archiveDir = join(metaPath, 'archive');
    mkdirSync(archiveDir, { recursive: true });

    // Create maxArchive + 2 pre-existing archive files
    for (let i = 0; i < config.maxArchive + 2; i++) {
      const padded = String(i).padStart(2, '0');
      const ts = `2024-01-01T00-00-${padded}-000Z`;
      writeFileSync(
        join(archiveDir, `${ts}.json`),
        JSON.stringify({ _id: 'old', _content: `archive-${String(i)}` }),
      );
    }

    finalizeCycle(baseOpts());

    // maxArchive + 2 pre-existing + 1 new = maxArchive + 3, pruned to maxArchive
    const archiveFiles = listArchiveFiles(metaPath);
    expect(archiveFiles.length).toBe(config.maxArchive);
  });

  it('threads state and stateOnly through to mergeAndWrite', () => {
    const opts = baseOpts();
    opts.current._content = 'preserved content';
    opts.current._generatedAt = '2024-06-15T12:00:00.000Z';

    const result = finalizeCycle({
      ...opts,
      state: { step: 3 },
      stateOnly: true,
    });

    expect(result._state).toEqual({ step: 3 });
    expect(result._content).toBe('preserved content');
    expect(result._generatedAt).toBe('2024-06-15T12:00:00.000Z');
  });
});
