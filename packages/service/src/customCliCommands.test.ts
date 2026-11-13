/**
 * Tests for the custom CLI commands on the SDK (Decision 187): each command
 * calls its catalog entry against a real app on a loopback port and prints
 * the JSON response; a failure prints one error line and sets exit code 1.
 *
 * @module customCliCommands.test
 */

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

let base = 'http://127.0.0.1:1938';
vi.mock('@karmaniverous/jeeves', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getServiceUrl: () => base,
}));

const { errorLine, registerCustomCliCommands, serviceBaseUrl } =
  await import('./customCliCommands.js');
const { createTestApp, makeTestDeps } = await import('./routes/__testUtils.js');

let app: FastifyInstance;
let port: string;

beforeAll(async () => {
  app = createTestApp(makeTestDeps());
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  port = new URL(address).port;
  base = `http://127.0.0.1:${DEFAULT_PORT_STR}`;
});

afterAll(async () => {
  await app.close();
});

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
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

describe('serviceBaseUrl', () => {
  it('uses the service URL, with --port when it is not the default', () => {
    expect(serviceBaseUrl(DEFAULT_PORT_STR)).toBe('http://127.0.0.1:1938');
    expect(serviceBaseUrl('2000')).toBe('http://127.0.0.1:2000');
  });
});

describe('commands', () => {
  it('prints the response as JSON', async () => {
    const res = await cli('queue', 'clear', '--port', port);
    expect(res.exitCode).toBeUndefined();
    expect(JSON.parse(res.stdout)).toEqual({ cleared: 0 });
  });

  it('passes a path argument to its entry', async () => {
    const res = await cli('unlock', 'j:/no/such', '--port', port);
    expect(res.stdout).toBe('');
    expect(res.stderr).toBe(
      'Error: No lock file at j:/no/such (already unlocked) (HTTP 409 META_NOT_LOCKED)',
    );
    expect(res.exitCode).toBe(1);
  });

  it('prints one error line and exits 1 when the service is down', async () => {
    const res = await cli('list', '--port', '9');
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
