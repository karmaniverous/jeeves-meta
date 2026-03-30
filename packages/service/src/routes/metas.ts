/**
 * GET /metas — list metas with optional filters.
 * GET /metas/:path — single meta detail.
 *
 * @module routes/metas
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { listArchiveFiles } from '../archive/index.js';
import { computeSummary } from '../discovery/computeSummary.js';
import { getScopeFiles } from '../discovery/index.js';
import { findNode, listMetas } from '../discovery/index.js';
import type { WatcherClient, WatcherScanPoint } from '../interfaces/index.js';
import { normalizePath } from '../normalizePath.js';
import { computeStalenessScore } from '../scheduling/index.js';
import type { RouteDeps } from './index.js';

const metasQuerySchema = z.object({
  pathPrefix: z.string().optional(),
  hasError: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  staleHours: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .optional(),
  neverSynthesized: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  locked: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  fields: z.string().optional(),
});

const metaDetailQuerySchema = z.object({
  fields: z.string().optional(),
  includeArchive: z
    .union([
      z.enum(['true', 'false']).transform((v) => v === 'true'),
      z.string().transform(Number).pipe(z.number().int().nonnegative()),
    ])
    .optional(),
});

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

function getArchiveFilePath(point: WatcherScanPoint): string {
  const value = point.payload?.file_path;
  return typeof value === 'string' ? value : '';
}

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

async function readArchiveFromWatcher(
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

async function readArchiveFromDisk(
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

export function registerMetasRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get('/metas', async (request) => {
    const query = metasQuerySchema.parse(request.query);
    const { config, watcher } = deps;

    const result = await listMetas(config, watcher);
    let entries = result.entries;

    // Apply filters
    if (query.pathPrefix) {
      entries = entries.filter((e) => e.path.includes(query.pathPrefix!));
    }
    if (query.hasError !== undefined) {
      entries = entries.filter((e) => e.hasError === query.hasError);
    }
    if (query.neverSynthesized !== undefined) {
      entries = entries.filter(
        (e) => (e.lastSynthesized === null) === query.neverSynthesized,
      );
    }
    if (query.locked !== undefined) {
      entries = entries.filter((e) => e.locked === query.locked);
    }
    if (typeof query.staleHours === 'number') {
      entries = entries.filter(
        (e) => e.stalenessSeconds >= query.staleHours! * 3600,
      );
    }

    // Summary (computed from filtered entries)
    const summary = computeSummary(entries, config.depthWeight);

    // Field projection
    const fieldList = query.fields?.split(',');
    const defaultFields = [
      'path',
      'depth',
      'emphasis',
      'stalenessSeconds',
      'lastSynthesized',
      'hasError',
      'locked',
      'architectTokens',
      'builderTokens',
      'criticTokens',
    ];
    const projectedFields = fieldList ?? defaultFields;

    const metas = entries.map((e) => {
      const full: Record<string, unknown> = {
        path: e.path,
        depth: e.depth,
        emphasis: e.emphasis,
        stalenessSeconds:
          e.stalenessSeconds === Infinity
            ? null
            : Math.round(e.stalenessSeconds),
        lastSynthesized: e.lastSynthesized,
        hasError: e.hasError,
        locked: e.locked,
        architectTokens: e.architectTokens,
        builderTokens: e.builderTokens,
        criticTokens: e.criticTokens,
      };
      const projected: Record<string, unknown> = {};
      for (const f of projectedFields) {
        if (f in full) projected[f] = full[f];
      }
      return projected;
    });

    return { summary, metas };
  });

  app.get<{ Params: { path: string } }>(
    '/metas/:path',
    async (request, reply) => {
      const query = metaDetailQuerySchema.parse(request.query);
      const { config, watcher } = deps;

      const targetPath = normalizePath(decodeURIComponent(request.params.path));
      const result = await listMetas(config, watcher);
      const targetNode = findNode(result.tree, targetPath);

      if (!targetNode) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + targetPath,
        });
      }

      const meta = JSON.parse(
        await readFile(join(targetNode.metaPath, 'meta.json'), 'utf8'),
      ) as Record<string, unknown>;

      // Field projection
      const defaultExclude = new Set([
        '_architect',
        '_builder',
        '_critic',
        '_content',
        '_feedback',
      ]);
      const fieldList = query.fields?.split(',');

      const projectMeta = (
        m: Record<string, unknown>,
      ): Record<string, unknown> => {
        if (fieldList) {
          const r: Record<string, unknown> = {};
          for (const f of fieldList) r[f] = m[f];
          return r;
        }
        const r: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(m)) {
          if (!defaultExclude.has(k)) r[k] = v;
        }
        return r;
      };

      // Compute scope
      const { scopeFiles, allFiles } = await getScopeFiles(targetNode, watcher);

      // Compute staleness
      const metaTyped = meta as Record<string, unknown> & {
        _generatedAt?: string;
        _depth?: number;
        _emphasis?: number;
      };
      const staleSeconds = metaTyped._generatedAt
        ? Math.round(
            (Date.now() - new Date(metaTyped._generatedAt).getTime()) / 1000,
          )
        : null;
      const score = computeStalenessScore(
        staleSeconds,
        metaTyped._depth ?? 0,
        metaTyped._emphasis ?? 1,
        config.depthWeight,
      );

      const response: Record<string, unknown> = {
        path: targetNode.metaPath,
        meta: projectMeta(meta),
        scope: {
          ownedFiles: scopeFiles.length,
          childMetas: targetNode.children.length,
          totalFiles: allFiles.length,
        },
        staleness: {
          seconds: staleSeconds,
          score: Math.round(score * 100) / 100,
        },
      };

      // Cross-refs status
      const crossRefsRaw = meta._crossRefs;
      if (Array.isArray(crossRefsRaw) && crossRefsRaw.length > 0) {
        response.crossRefs = await Promise.all(
          crossRefsRaw.map(async (refPath: unknown) => {
            const rp = String(refPath);
            const refMetaFile = join(rp, '.meta', 'meta.json');
            try {
              const refMeta = JSON.parse(
                await readFile(refMetaFile, 'utf8'),
              ) as Record<string, unknown>;
              return {
                path: rp,
                status: 'resolved',
                hasContent: Boolean(refMeta._content),
              };
            } catch {
              return { path: rp, status: 'missing' };
            }
          }),
        );
      }

      // Archive
      if (query.includeArchive) {
        const limit =
          typeof query.includeArchive === 'number'
            ? query.includeArchive
            : undefined;

        try {
          response.archive = await readArchiveFromWatcher(
            watcher,
            targetNode.metaPath,
            config.metaArchiveProperty,
            limit,
            projectMeta,
          );
        } catch {
          response.archive = await readArchiveFromDisk(
            targetNode.metaPath,
            limit,
            projectMeta,
          );
        }
      }

      return response;
    },
  );
}
