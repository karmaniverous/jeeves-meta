/**
 * Custom CLI commands for the jeeves-meta service, built on the SDK
 * (`@karmaniverous/jeeves-meta-sdk`, Decision 187). Each command calls one
 * catalog entry and prints the response as JSON; a failure prints one
 * error line to stderr and sets exit code 1.
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

import { DEFAULT_PORT_STR } from './constants.js';

/**
 * The service's base URL on the given port.
 *
 * @param port - Port string from `--port`.
 * @returns The base URL.
 */
export function serviceBaseUrl(port: string): string {
  const url = new URL(getServiceUrl('meta'));
  if (port !== DEFAULT_PORT_STR) url.port = port;
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
 * @param port - Port string from `--port`.
 * @param call - The SDK call.
 */
export async function runCommand(
  port: string,
  call: (meta: MetaClient) => Promise<unknown>,
): Promise<void> {
  try {
    const data = await call(
      createMetaClient({ baseUrl: serviceBaseUrl(port) }),
    );
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(errorLine(error));
    process.exitCode = 1;
  }
}

/** Options every command takes. */
interface PortOption {
  port: string;
}

/**
 * Register all custom meta commands on the parent program.
 *
 * @param program - The service CLI.
 */
export function registerCustomCliCommands(program: Command): void {
  const command = (spec: string, description: string): Command =>
    program
      .command(spec)
      .description(description)
      .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR);

  command('list', 'List all discovered meta entities').action(
    (opts: PortOption) => runCommand(opts.port, (meta) => meta.listMetas()),
  );

  command('detail <path>', 'Show full detail for a single meta entity').action(
    (path: string, opts: PortOption) =>
      runCommand(opts.port, (meta) => meta.metaDetail({ path })),
  );

  command('preview', 'Dry-run: preview inputs for next synthesis cycle')
    .option('--path <path>', 'Specific meta path to preview')
    .action((opts: PortOption & { path?: string }) =>
      runCommand(opts.port, (meta) =>
        meta.preview(opts.path ? { path: opts.path } : {}),
      ),
    );

  command('synthesize', 'Trigger synthesis (enqueues work)')
    .option('--path <path>', 'Specific meta path to synthesize')
    .action((opts: PortOption & { path?: string }) =>
      runCommand(opts.port, (meta) =>
        meta.synthesize(opts.path ? { path: opts.path } : {}),
      ),
    );

  command(
    'seed <path>',
    'Create .meta/ directory + meta.json for a path',
  ).action((path: string, opts: PortOption) =>
    runCommand(opts.port, (meta) => meta.seed({ path })),
  );

  command('unlock <path>', 'Remove .lock file from a meta entity').action(
    (path: string, opts: PortOption) =>
      runCommand(opts.port, (meta) => meta.unlock({ path })),
  );

  command('abort', 'Abort the current synthesis in progress').action(
    (opts: PortOption) => runCommand(opts.port, (meta) => meta.abort()),
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

  queue
    .command('list')
    .description('Show current queue state')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action((opts: PortOption) =>
      runCommand(opts.port, (meta) => meta.queue()),
    );

  queue
    .command('clear')
    .description('Remove all pending items from the queue')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action((opts: PortOption) =>
      runCommand(opts.port, (meta) => meta.queueClear()),
    );
}
