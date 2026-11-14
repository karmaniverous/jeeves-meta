/**
 * @module cliRoots.test
 * Root resolution for the custom CLI commands: flag, then env, then the
 * workspace's `jeeves.config.json`, then jeeves' defaults; `initRoots`
 * initialises jeeves with the absolute roots.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  getConfigRoot,
  getWorkspacePath,
  resetInit,
} from '@karmaniverous/jeeves';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { initRoots, resolveRoots } from './cliRoots.js';

let ws: string;

beforeAll(() => {
  ws = mkdtempSync(join(tmpdir(), 'meta-roots-'));
  writeFileSync(
    join(ws, 'jeeves.config.json'),
    JSON.stringify({ core: { configRoot: 'from-file' } }),
  );
});

afterAll(() => {
  rmSync(ws, { recursive: true, force: true });
});

afterEach(() => {
  resetInit();
});

describe('resolveRoots', () => {
  it('takes the flags first', () => {
    expect(
      resolveRoots(
        { workspace: ws, configRoot: 'from-flag' },
        { JEEVES_CONFIG_ROOT: 'from-env' },
      ),
    ).toEqual({ workspace: ws, configRoot: 'from-flag' });
  });

  it('then the environment', () => {
    expect(
      resolveRoots(
        {},
        { JEEVES_WORKSPACE: ws, JEEVES_CONFIG_ROOT: 'from-env' },
      ),
    ).toEqual({ workspace: ws, configRoot: 'from-env' });
  });

  it("then the workspace's jeeves.config.json", () => {
    expect(resolveRoots({ workspace: ws }, {})).toEqual({
      workspace: ws,
      configRoot: 'from-file',
    });
  });

  it("then jeeves' defaults", () => {
    const empty = mkdtempSync(join(tmpdir(), 'meta-roots-empty-'));
    try {
      expect(resolveRoots({ workspace: empty }, {}).configRoot).toBe(
        './config',
      );
      expect(resolveRoots({}, {}).workspace).toBe('.');
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('initRoots', () => {
  it('initialises jeeves with the absolute roots', () => {
    initRoots({ workspace: ws, configRoot: 'from-flag' }, {});
    expect(getWorkspacePath()).toBe(resolve(ws));
    expect(getConfigRoot()).toBe(resolve('from-flag'));
  });

  it('refuses a Windows drive path off Windows, before resolving it', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    try {
      expect(() => {
        initRoots({ workspace: ws, configRoot: 'j:/config' }, {});
      }).toThrow(
        /configRoot "j:\/config" looks like a Windows drive-letter path/,
      );
    } finally {
      vi.restoreAllMocks();
    }
  });
});
