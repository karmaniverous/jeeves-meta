/**
 * Core seed logic — create a .meta/ directory with initial meta.json.
 *
 * Shared between the POST /seed route handler and the auto-seed pass.
 *
 * @module seed/createMeta
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveMetaDir } from '../lock.js';

/** Options for creating a new meta. */
export interface CreateMetaOptions {
  /** Cross-references to other meta owner paths. */
  crossRefs?: string[];
  /** Steering prompt for the meta. */
  steer?: string;
}

/** Result of creating a new meta. */
export interface CreateMetaResult {
  /** Absolute path to the .meta/ directory. */
  metaDir: string;
  /** The generated UUID. */
  _id: string;
}

/**
 * Create a .meta/ directory with an initial meta.json.
 *
 * Does NOT check for existing .meta/ — caller is responsible for that guard.
 *
 * @param ownerPath - The owner directory path.
 * @param options - Optional cross-refs and steering prompt.
 * @returns The meta directory path and generated ID.
 */
export async function createMeta(
  ownerPath: string,
  options?: CreateMetaOptions,
): Promise<CreateMetaResult> {
  const metaDir = resolveMetaDir(ownerPath);
  await mkdir(metaDir, { recursive: true });

  const _id = randomUUID();
  const metaJson: Record<string, unknown> = { _id };
  if (options?.crossRefs !== undefined) metaJson._crossRefs = options.crossRefs;
  if (options?.steer !== undefined) metaJson._steer = options.steer;

  const metaJsonPath = join(metaDir, 'meta.json');
  await writeFile(metaJsonPath, JSON.stringify(metaJson, null, 2) + '\n');

  return { metaDir, _id };
}

/**
 * Check if a .meta/ directory already exists for an owner path.
 *
 * @param ownerPath - The owner directory path.
 * @returns True if .meta/ already exists.
 */
export function metaExists(ownerPath: string): boolean {
  return existsSync(resolveMetaDir(ownerPath));
}
