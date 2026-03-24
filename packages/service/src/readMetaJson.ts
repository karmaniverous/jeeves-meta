/**
 * Read and parse a meta.json file from a `.meta/` directory.
 *
 * Shared utility to eliminate repeated `JSON.parse(readFileSync(...))` across
 * discovery, orchestration, and route handlers.
 *
 * @module readMetaJson
 */

import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MetaJson } from './schema/index.js';

/**
 * Read and parse a meta.json file from a `.meta/` directory path (async).
 *
 * @param metaPath - Path to the `.meta/` directory.
 * @returns Parsed meta.json content.
 * @throws If the file doesn't exist or contains invalid JSON.
 */
export async function readMetaJson(metaPath: string): Promise<MetaJson> {
  const raw = await readFile(join(metaPath, 'meta.json'), 'utf8');
  return JSON.parse(raw) as MetaJson;
}

/**
 * Read and parse a meta.json file synchronously.
 *
 * Used only where async is not possible (lock acquisition, startup config).
 *
 * @param metaPath - Path to the `.meta/` directory.
 * @returns Parsed meta.json content.
 * @throws If the file doesn't exist or contains invalid JSON.
 */
export function readMetaJsonSync(metaPath: string): MetaJson {
  return JSON.parse(
    readFileSync(join(metaPath, 'meta.json'), 'utf8'),
  ) as MetaJson;
}
