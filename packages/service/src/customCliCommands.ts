/**
 * Custom CLI commands for the jeeves-meta service, built on the SDK
 * (`@karmaniverous/jeeves-meta-sdk`, Decision 187). Each command calls one
 * catalog entry and prints the response as JSON; a failure prints one
 * error line to stderr and sets exit code 1. The service URL comes from
 * jeeves (`getServiceUrl('meta')`) after the workspace and config root are
 * resolved (`cliRoots`); `--port` overrides its port.
 *
 * Registered via `descriptor.customCliCommands` and added to the
 * standard service CLI produced by `createServiceCli`.
 *
 * @module customCliCommands
 */

import { getServiceUrl } from '@karmaniverous/jeeves';
import {
  createMetaClient,
  isMetaError,
  type MetaClient,
} from '@karmaniverous/jeeves-meta-sdk';
import { type Command } from 'commander';

import { initRoots, type RootOptions } from './cliRoots.js';
import { DEFAULT_PORT_STR } from './constants.js';

/** Options every command takes. */
export interface CommandOptions extends RootOptions {
  /** `-p/--port`. */
  port: string;
}

/**
 * The service's base URL: jeeves' URL for meta, with `--port` when it is
 * not the default.
 *
 * @param opts - The command's options.
 * @returns The base URL.
 */
export function serviceBaseUrl(opts: CommandOptions): string {
  initRoots(opts);
  const url = new URL(getServiceUrl('meta'));
  if (opts.port !== DEFAULT_PORT_STR) url.port = opts.port;
  return url.origin;
}

/**
 * The one error line a failed command prints: the message, and for an
 * HTTP failure its status and code.
 *
 * @param error - What the call threw.
 * @returns The line, without a trailing newline.
 */
export function errorLine(error: unknown): string {
  if (isMetaError(error) && error.status > 0)
    return `Error: ${error.message} (HTTP ${String(error.status)} ${error.code})`;
  return `Error: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Run one command: call the service, print the result as JSON, or print
 * the error line and set exit code 1.
 *
 * @param opts - The command's options.
 * @param call - The SDK call.
 */
export async function runCommand(
  opts: CommandOptions,
  call: (meta: MetaClient) => Promise<unknown>,
): Promise<void> {
  try {
    const data = await call(
      createMetaClient({ baseUrl: serviceBaseUrl(opts) }),
    );
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(errorLine(error));
    process.exitCode = 1;
  }
}

/**
 * Add the options every service command takes: `--port`, and the roots
 * jeeves resolves the service URL from (no defaults, so the environment and
 * `jeeves.config.json` apply when a flag is absent).
 *
 * @param cmd - The command.
 * @returns It.
 */
function withServiceOptions(cmd: Command): Command {
  return cmd
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .option('-w, --workspace <path>', 'Workspace root path')
    .option('--config-root <path>', 'Platform config root path');
}

/**
 * Register all custom meta commands on the parent program.
 *
 * @param program - The service CLI.
 */
export function registerCustomCliCommands(program: Command): void {
  const command = (spec: string, description: string): Command =>
    withServiceOptions(program.command(spec).description(description));

  command('list', 'List all discovered meta entities').action(
    (opts: CommandOptions) => runCommand(opts, (meta) => meta.listMetas()),
  );

  command('detail <path>', 'Show full detail for a single meta entity').action(
    (path: string, opts: CommandOptions) =>
      runCommand(opts, (meta) => meta.metaDetail({ path })),
  );

  command('preview', 'Dry-run: preview inputs for next synthesis cycle')
    .option('--path <path>', 'Specific meta path to preview')
    .action((opts: CommandOptions & { path?: string }) =>
      runCommand(opts, (meta) =>
        meta.preview(opts.path ? { path: opts.path } : {}),
      ),
    );

  command('synthesize', 'Trigger synthesis (enqueues work)')
    .option('--path <path>', 'Specific meta path to synthesize')
    .action((opts: CommandOptions & { path?: string }) =>
      runCommand(opts, (meta) =>
        meta.synthesize(opts.path ? { path: opts.path } : {}),
      ),
    );

  command(
    'seed <path>',
    'Create .meta/ directory + meta.json for a path',
  ).action((path: string, opts: CommandOptions) =>
    runCommand(opts, (meta) => meta.seed({ path })),
  );

  command('unlock <path>', 'Remove .lock file from a meta entity').action(
    (path: string, opts: CommandOptions) =>
      runCommand(opts, (meta) => meta.unlock({ path })),
  );

  command('abort', 'Abort the current synthesis in progress').action(
    (opts: CommandOptions) => runCommand(opts, (meta) => meta.abort()),
  );

  command('prune', 'Prune old archive snapshots beyond maxArchive').action(
    () => {
      // The service has no prune route yet (jeeves-meta#69); 0.19.0 called a
      // missing route and failed with HTTP 404.
      console.error(
        'Error: archive pruning has no API route yet (jeeves-meta#69)',
      );
      process.exitCode = 1;
    },
  );

  const queue = program
    .command('queue')
    .description('Queue management commands');

  const queueCommand = (name: string, description: string): Command =>
    withServiceOptions(queue.command(name).description(description));

  queueCommand('list', 'Show current queue state').action(
    (opts: CommandOptions) => runCommand(opts, (meta) => meta.queue()),
  );

  queueCommand('clear', 'Remove all pending items from the queue').action(
    (opts: CommandOptions) => runCommand(opts, (meta) => meta.queueClear()),
  );
}
