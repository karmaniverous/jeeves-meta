/**
 * Custom CLI commands for the jeeves-meta service.
 *
 * Registered via `descriptor.customCliCommands` and added to the
 * standard service CLI produced by `createServiceCli`.
 *
 * @module customCliCommands
 */

import { fetchJson, getServiceUrl, postJson } from '@karmaniverous/jeeves';
import { type Command } from 'commander';

import { DEFAULT_PORT_STR } from './constants.js';

/** Build the full API URL for a given port string and path. */
function apiUrl(port: string, apiPath: string): string {
  const url = new URL(apiPath, getServiceUrl('meta'));
  if (port !== DEFAULT_PORT_STR) {
    url.port = port;
  }
  return url.toString();
}

/** Wrap an async CLI action with consistent error handling. */
function withErrorHandling(
  fn: () => Promise<void>,
  label: string,
): Promise<void> {
  return fn().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${label}: ${msg}`);
    process.exitCode = 1;
  });
}

/** Print JSON data to stdout. */
function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Register all custom meta commands on the parent program. */
export function registerCustomCliCommands(program: Command): void {
  // ─── list ─────────────────────────────────────────────────
  program
    .command('list')
    .description('List all discovered meta entities')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await fetchJson(apiUrl(opts.port, '/metas'));
        printJson(data);
      }, 'Error');
    });

  // ─── detail ───────────────────────────────────────────────
  program
    .command('detail <path>')
    .description('Show full detail for a single meta entity')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (metaPath: string, opts: { port: string }) => {
      await withErrorHandling(async () => {
        const encoded = encodeURIComponent(metaPath);
        const data = await fetchJson(apiUrl(opts.port, `/metas/${encoded}`));
        printJson(data);
      }, 'Error');
    });

  // ─── preview ──────────────────────────────────────────────
  program
    .command('preview')
    .description('Dry-run: preview inputs for next synthesis cycle')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .option('--path <path>', 'Specific meta path to preview')
    .action(async (opts: { port: string; path?: string }) => {
      await withErrorHandling(async () => {
        const qs = opts.path ? '?path=' + encodeURIComponent(opts.path) : '';
        const data = await fetchJson(apiUrl(opts.port, '/preview' + qs));
        printJson(data);
      }, 'Error');
    });

  // ─── synthesize ───────────────────────────────────────────
  program
    .command('synthesize')
    .description('Trigger synthesis (enqueues work)')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .option('--path <path>', 'Specific meta path to synthesize')
    .action(async (opts: { port: string; path?: string }) => {
      await withErrorHandling(async () => {
        const body = opts.path ? { path: opts.path } : {};
        const data = await postJson(apiUrl(opts.port, '/synthesize'), body);
        printJson(data);
      }, 'Error');
    });

  // ─── seed ─────────────────────────────────────────────────
  program
    .command('seed <path>')
    .description('Create .meta/ directory + meta.json for a path')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (metaPath: string, opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await postJson(apiUrl(opts.port, '/seed'), {
          path: metaPath,
        });
        printJson(data);
      }, 'Error');
    });

  // ─── unlock ───────────────────────────────────────────────
  program
    .command('unlock <path>')
    .description('Remove .lock file from a meta entity')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (metaPath: string, opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await postJson(apiUrl(opts.port, '/unlock'), {
          path: metaPath,
        });
        printJson(data);
      }, 'Error');
    });

  // ─── abort ────────────────────────────────────────────────
  program
    .command('abort')
    .description('Abort the current synthesis in progress')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await postJson(apiUrl(opts.port, '/synthesize/abort'), {});
        printJson(data);
      }, 'Error');
    });

  // ─── prune ────────────────────────────────────────────────
  program
    .command('prune')
    .description('Prune old archive snapshots beyond maxArchive')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await postJson(apiUrl(opts.port, '/archive/prune'), {});
        printJson(data);
      }, 'Error');
    });

  // ─── queue ────────────────────────────────────────────────
  const queueCmd = program
    .command('queue')
    .description('Queue management commands');

  queueCmd
    .command('list')
    .description('Show current queue state')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await fetchJson(apiUrl(opts.port, '/queue'));
        printJson(data);
      }, 'Error');
    });

  queueCmd
    .command('clear')
    .description('Remove all pending items from the queue')
    .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
    .action(async (opts: { port: string }) => {
      await withErrorHandling(async () => {
        const data = await postJson(apiUrl(opts.port, '/queue/clear'), {});
        printJson(data);
      }, 'Error');
    });
}
