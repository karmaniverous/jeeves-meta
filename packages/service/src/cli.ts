/**
 * Commander CLI for jeeves-meta service.
 *
 * @module cli
 */

import { Command } from 'commander';

import { loadServiceConfig, resolveConfigPath } from './configLoader.js';
import { DEFAULT_PORT_STR, SERVICE_NAME } from './constants.js';
import { startService } from './index.js';
import { registerServiceCommand } from './serviceCommand.js';

const program = new Command();

program.name(SERVICE_NAME).description('Jeeves Meta synthesis service');

// ─── start ──────────────────────────────────────────────────────────
program
  .command('start')
  .description('Start the HTTP service')
  .requiredOption('-c, --config <path>', 'Path to config JSON file')
  .action(async (opts: { config: string }) => {
    const configPath = resolveConfigPath(['-c', opts.config]);
    const config = loadServiceConfig(configPath);
    await startService(config, configPath);
  });

// ─── API client helpers ─────────────────────────────────────────────
function apiUrl(port: number, path: string): string {
  return `http://127.0.0.1:${String(port)}${path}`;
}

async function apiGet(port: number, path: string): Promise<unknown> {
  const res = await fetch(apiUrl(port, path));
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${String(res.status)} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function apiPost(
  port: number,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(apiUrl(port, path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${String(res.status)} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// ─── status ─────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show service status')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .action(async (opts: { port: string }) => {
    try {
      const data = await apiGet(parseInt(opts.port, 10), '/status');
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Service unreachable:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── list ───────────────────────────────────────────────────────────
program
  .command('list')
  .description('List all discovered meta entities')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .action(async (opts: { port: string }) => {
    try {
      const data = await apiGet(parseInt(opts.port, 10), '/metas');
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── detail ─────────────────────────────────────────────────────────
program
  .command('detail <path>')
  .description('Show full detail for a single meta entity')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const encoded = encodeURIComponent(metaPath);
      const data = await apiGet(parseInt(opts.port, 10), `/metas/${encoded}`);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── preview ────────────────────────────────────────────────────────
program
  .command('preview')
  .description('Dry-run: preview inputs for next synthesis cycle')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .option('--path <path>', 'Specific meta path to preview')
  .action(async (opts: { port: string; path?: string }) => {
    try {
      const qs = opts.path ? '?path=' + encodeURIComponent(opts.path) : '';
      const data = await apiGet(parseInt(opts.port, 10), '/preview' + qs);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── synthesize ─────────────────────────────────────────────────────
program
  .command('synthesize')
  .description('Trigger synthesis (enqueues work)')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .option('--path <path>', 'Specific meta path to synthesize')
  .action(async (opts: { port: string; path?: string }) => {
    try {
      const body = opts.path ? { path: opts.path } : {};
      const data = await apiPost(parseInt(opts.port, 10), '/synthesize', body);
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── seed ───────────────────────────────────────────────────────────
program
  .command('seed <path>')
  .description('Create .meta/ directory + meta.json for a path')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const data = await apiPost(parseInt(opts.port, 10), '/seed', {
        path: metaPath,
      });
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── unlock ─────────────────────────────────────────────────────────
program
  .command('unlock <path>')
  .description('Remove .lock file from a meta entity')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .action(async (metaPath: string, opts: { port: string }) => {
    try {
      const data = await apiPost(parseInt(opts.port, 10), '/unlock', {
        path: metaPath,
      });
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── validate ───────────────────────────────────────────────────────
program
  .command('validate')
  .description('Validate current or candidate config')
  .option('-p, --port <port>', 'Service port', DEFAULT_PORT_STR)
  .option('-c, --config <path>', 'Validate a candidate config file locally')
  .action(async (opts: { port: string; config?: string }) => {
    try {
      if (opts.config) {
        // Local validation — parse candidate file through Zod schema
        const { loadServiceConfig } = await import('./configLoader.js');
        const configPath = opts.config;
        const config = loadServiceConfig(configPath);
        const sanitized = {
          ...config,
          gatewayApiKey: config.gatewayApiKey ? '[REDACTED]' : undefined,
        };
        console.log(JSON.stringify(sanitized, null, 2));
      } else {
        // Remote — query running service
        const data = await apiGet(parseInt(opts.port, 10), '/config');
        console.log(JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('Error:', (err as Error).message);
      process.exit(1);
    }
  });

// ─── service install/uninstall ──────────────────────────────────────
registerServiceCommand(program, apiGet, DEFAULT_PORT_STR);

program.parse();
