/**
 * Tests for the custom CLI commands on the SDK (Decision 187): each command
 * calls its catalog entry against a real app on a loopback port and prints
 * the JSON response; a failure prints one error line and sets exit code 1.
 * jeeves is not stubbed: the service URL comes from a real core config
 * under a temporary config root, through `getServiceUrl('meta')`.
 *
 * @module customCliCommands.test
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resetInit } from '@karmaniverous/jeeves';
import { Command } from 'commander';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { DEFAULT_PORT_STR } from './constants.js';
import {
  errorLine,
  registerCustomCliCommands,
  serviceBaseUrl,
} from './customCliCommands.js';
import { createTestApp, makeTestDeps } from './routes/__testUtils.js';

let app: FastifyInstance;
let port: string;
let tmp: string;
/** Config root whose core config points meta at the test app. */
let configured: string;
/** Config root with no core config. */
let empty: string;

beforeAll(async () => {
  app = createTestApp(makeTestDeps());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  port = new URL(address).port;
  tmp = mkdtempSync(join(tmpdir(), 'meta-cli-'));
  configured = join(tmp, 'configured');
  empty = join(tmp, 'empty');
  mkdirSync(join(configured, 'jeeves-core'), { recursive: true });
  mkdirSync(empty);
  writeFileSync(
    join(configured, 'jeeves-core', 'config.json'),
    JSON.stringify({ services: { meta: { url: address } } }),
  );
});

afterAll(async () => {
  await app.close();
  rmSync(tmp, { recursive: true, force: true });
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  resetInit();
});

/** Run the CLI with `args`; returns what it printed. */
async function cli(...args: string[]) {
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const program = new Command().exitOverride();
  registerCustomCliCommands(program);
  await program.parseAsync(args, { from: 'user' });
  return {
    stdout: out.mock.calls.map((c) => String(c[0])).join('\n'),
    stderr: err.mock.calls.map((c) => String(c[0])).join('\n'),
    exitCode: process.exitCode,
  };
}

/** Root flags selecting config root `root` (workspace: the temp dir). */
const roots = (root: string) => ['--workspace', tmp, '--config-root', root];

describe('serviceBaseUrl', () => {
  it("uses jeeves' configured URL for meta", () => {
    expect(
      serviceBaseUrl({
        port: DEFAULT_PORT_STR,
        workspace: tmp,
        configRoot: configured,
      }),
    ).toBe(`http://127.0.0.1:${port}`);
  });

  it('falls back to the default port with no core config', () => {
    expect(
      serviceBaseUrl({
        port: DEFAULT_PORT_STR,
        workspace: tmp,
        configRoot: empty,
      }),
    ).toBe('http://127.0.0.1:1938');
  });

  it('applies --port when it is not the default', () => {
    expect(
      serviceBaseUrl({ port: '2000', workspace: tmp, configRoot: configured }),
    ).toBe('http://127.0.0.1:2000');
  });
});
describe('commands', () => {
  it('prints the response from the configured service as JSON', async () => {
    const res = await cli('queue', 'clear', ...roots(configured));
    expect(res.exitCode).toBeUndefined();
    expect(JSON.parse(res.stdout)).toEqual({ cleared: 0 });
  });

  it('passes a path argument to its entry', async () => {
    const res = await cli('unlock', 'j:/no/such', ...roots(configured));
    expect(res.stdout).toBe('');
    expect(res.stderr).toBe(
      'Error: No lock file at j:/no/such (already unlocked) (HTTP 409 META_NOT_LOCKED)',
    );
    expect(res.exitCode).toBe(1);
  });

  it('prints one error line and exits 1 when the service is down', async () => {
    const res = await cli('list', '--port', '9', ...roots(configured));
    expect(res.stderr).toMatch(/^Error: listMetas request failed: /);
    expect(res.stderr.split('\n')).toHaveLength(1);
    expect(res.exitCode).toBe(1);
  });

  it('refuses prune: the service has no prune route (#69)', async () => {
    const res = await cli('prune');
    expect(res.stderr).toContain('jeeves-meta#69');
    expect(res.exitCode).toBe(1);
  });
});

describe('errorLine', () => {
  it('names a plain error by its message', () => {
    expect(errorLine(new Error('boom'))).toBe('Error: boom');
    expect(errorLine('text')).toBe('Error: text');
  });
});
