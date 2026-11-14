/**
 * Capture a wire baseline from an older release (spec 4.4.2, Decision 211).
 *
 * Checks the tag out into a temporary git worktree, installs it, copies the
 * current wire harness (`src/test/wire/*.ts`, tests excluded) and the
 * recording config into it, records every wire scenario against that
 * release's routes, and writes the records to the output file. The worktree
 * is removed afterwards, whether or not the capture succeeds. Use it when
 * scenarios are added after the routes have changed.
 *
 * Usage (from packages/service; Node strips the types):
 * `node scripts/capture-wire.ts [--tag service/0.19.0] [--out <path>]`
 *
 * The harness must stay portable to the tag: it may only import service
 * modules that already exist there.
 *
 * @module scripts/capture-wire
 */

import { execFileSync, execSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const repo = resolve(pkg, '..', '..');

const { values } = parseArgs({
  options: {
    tag: { type: 'string', default: 'service/0.19.0' },
    out: {
      type: 'string',
      default: join(pkg, 'src', 'test', 'wire', 'wire-0.19.0.json'),
    },
  },
});
const out = resolve(values.out);

/**
 * Run a command, inheriting stdio. On Windows npm/npx are `.cmd` shims that
 * need a shell, so the command runs as one quoted command line there.
 *
 * @param cmd - Executable.
 * @param args - Arguments.
 * @param cwd - Working directory.
 * @param env - Extra environment variables.
 */
const run = (
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): void => {
  const options = {
    cwd,
    stdio: 'inherit' as const,
    env: { ...process.env, ...env },
  };
  if (process.platform === 'win32')
    // The command name stays unquoted: a quoted `.cmd` shim resolves its own
    // directory (%~dp0) against the cwd.
    execSync([cmd, ...args.map((a) => `"${a}"`)].join(' '), options);
  else execFileSync(cmd, args, options);
};

const worktree = mkdtempSync(join(tmpdir(), 'jeeves-meta-wire-capture-'));
process.stdout.write(
  `capture: ${values.tag} -> ${out}\nworktree: ${worktree}\n`,
);
run('git', ['worktree', 'add', '--detach', worktree, values.tag], repo);
try {
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], worktree);

  const wireSrc = join(pkg, 'src', 'test', 'wire');
  const wireDst = join(worktree, 'packages', 'service', 'src', 'test', 'wire');
  mkdirSync(wireDst, { recursive: true });
  for (const name of readdirSync(wireSrc)) {
    if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      copyFileSync(join(wireSrc, name), join(wireDst, name));
    }
  }
  copyFileSync(
    join(pkg, 'vitest.wire-record.config.ts'),
    join(worktree, 'packages', 'service', 'vitest.wire-record.config.ts'),
  );

  run(
    'npx',
    ['vitest', 'run', '--config', 'vitest.wire-record.config.ts'],
    join(worktree, 'packages', 'service'),
    { WIRE_RECORD: out },
  );
  const records = JSON.parse(readFileSync(out, 'utf8')) as object;
  process.stdout.write(
    `capture: wrote ${String(Object.keys(records).length)} records\n`,
  );
} finally {
  run('git', ['worktree', 'remove', '--force', worktree], repo);
}
