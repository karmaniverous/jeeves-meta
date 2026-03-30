/**
 * Archive reading helpers — watcher scan with filesystem fallback.
 *
 * Used by the GET /metas/:path route to retrieve archive history.
 * Prefers watcher scan for performance; falls back to disk reads
 * when the watcher is unavailable.
 *
 * @module archive/readArchive
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { listArchiveFiles } from '../archive/index.js';
import type { WatcherClient, WatcherScanPoint } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';

/** Build a Qdrant filter for archive points under a given meta path. */
function buildArchiveScanFilter(
  metaPath: string,
  metaArchiveProperty: Record<string, unknown>,
): Record<string, unknown> {
  const must: Array<Record<string, unknown>> = [
    {
      key: 'file_path',
      match: { text: normalizePath(join(metaPath, 'archive')) },
    },
  ];

  for (const [key, value] of Object.entries(metaArchiveProperty)) {
    must.push({ key, match: { value } });
  }

  return { must };
}

/** Extract file_path from a scan point payload. */
function getArchiveFilePath(point: WatcherScanPoint): string {
  const value = point.payload?.file_path;
  return typeof value === 'string' ? value : '';
}

/** Project archive metadata, stripping indexing-internal fields. */
function projectArchivePayload(
  point: WatcherScanPoint,
  projectMeta: (m: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | null {
  const payload = point.payload ?? {};
  if (Object.keys(payload).length === 0) return null;

  const archiveMeta = { ...payload };
  delete archiveMeta.file_path;
  delete archiveMeta.chunk_text;
  delete archiveMeta.chunk_index;
  delete archiveMeta.total_chunks;
  delete archiveMeta.content_hash;
  delete archiveMeta.matched_rules;

  return projectMeta(archiveMeta);
}

/**
 * Read archive history via watcher scan.
 *
 * @param watcher - WatcherClient with scan support.
 * @param metaPath - Absolute path to the .meta/ directory.
 * @param metaArchiveProperty - Additional filter properties for archive points.
 * @param limit - Max entries to return (newest first). Undefined = all.
 * @param projectMeta - Field projection function.
 * @returns Array of projected archive entries, newest first.
 */
export async function readArchiveFromWatcher(
  watcher: WatcherClient,
  metaPath: string,
  metaArchiveProperty: Record<string, unknown>,
  limit: number | undefined,
  projectMeta: (m: Record<string, unknown>) => Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  if (limit === 0) return [];

  if (!watcher.scan) {
    throw new Error('Watcher scan not available');
  }

  const points: WatcherScanPoint[] = [];
  let cursor: string | undefined;

  do {
    const result = await watcher.scan({
      filter: buildArchiveScanFilter(metaPath, metaArchiveProperty),
      limit: 100,
      cursor,
    });

    points.push(...result.points);
    cursor = result.cursor ?? undefined;
  } while (cursor);

  const sorted = points.sort((a, b) =>
    getArchiveFilePath(a).localeCompare(getArchiveFilePath(b)),
  );

  return sorted
    .slice(limit ? -limit : 0)
    .reverse()
    .map((point) => projectArchivePayload(point, projectMeta))
    .filter((value): value is Record<string, unknown> => value !== null);
}

/**
 * Read archive history from disk (fallback).
 *
 * @param metaPath - Absolute path to the .meta/ directory.
 * @param limit - Max entries to return (newest first). Undefined = all.
 * @param projectMeta - Field projection function.
 * @returns Array of projected archive entries, newest first.
 */
export async function readArchiveFromDisk(
  metaPath: string,
  limit: number | undefined,
  projectMeta: (m: Record<string, unknown>) => Record<string, unknown>,
): Promise<Array<Record<string, unknown>>> {
  if (limit === 0) return [];

  const archiveFiles = listArchiveFiles(metaPath);
  const selected = (
    limit ? archiveFiles.slice(-limit) : archiveFiles
  ).reverse();
  return Promise.all(
    selected.map(async (archiveFile) => {
      const raw = await readFile(archiveFile, 'utf8');
      return projectMeta(JSON.parse(raw) as Record<string, unknown>);
    }),
  );
}
