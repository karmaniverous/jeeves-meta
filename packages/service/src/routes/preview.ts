/**
 * GET /preview — dry-run synthesis preview.
 *
 * @module routes/preview
 */

import { getEndpoint } from '@karmaniverous/jeeves-meta-core';
import type { FastifyInstance } from 'fastify';

import { findNode, getDeltaFiles, getScopeFiles } from '../discovery/index.js';
import { normalizePath } from '../normalizePath.js';
import {
  buildPhaseCandidates,
  computeInvalidation,
  getOwedPhase,
  getPriorityBand,
  selectPhaseCandidate,
} from '../phaseState/index.js';
import { readMetaJson } from '../readMetaJson.js';
import { computeStalenessScore } from '../scheduling/index.js';
import type { RouteDeps } from './index.js';

export function registerPreviewRoute(
  app: FastifyInstance,
  deps: RouteDeps,
): void {
  app.get(getEndpoint('preview').path, async (request, reply) => {
    const { config, watcher, cache } = deps;
    const query = request.query as { path?: string };

    let result;
    try {
      result = await cache.get(config, watcher);
    } catch {
      return reply.status(503).send({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Watcher unreachable — cannot compute preview',
      });
    }

    let targetNode;
    if (query.path) {
      const normalized = normalizePath(query.path);
      targetNode = findNode(result.tree, normalized);
      if (!targetNode) {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Meta path not found: ' + query.path,
        });
      }
    } else {
      // Select best phase candidate
      const candidates = buildPhaseCandidates(
        result.entries,
        config.architectEvery,
      );
      const winner = selectPhaseCandidate(candidates, config.depthWeight);
      if (!winner) {
        return { message: 'No stale metas found. Nothing to synthesize.' };
      }
      targetNode = findNode(result.tree, winner.node.metaPath)!;
    }

    const meta = await readMetaJson(targetNode.metaPath);

    // Scope files
    const { scopeFiles } = await getScopeFiles(targetNode, watcher);

    // Compute invalidation inputs (DRY: reuse phaseState/invalidate logic)
    const invalidation = await computeInvalidation(
      meta,
      scopeFiles,
      config,
      targetNode,
    );
    const { architectInvalidators, inputStatus, phaseState } = invalidation;
    const architectTriggered = architectInvalidators.length > 0;

    // Delta files
    const deltaFiles = getDeltaFiles(meta._generatedAt, scopeFiles);

    // EMA token estimates
    const estimatedTokens = {
      architect: meta._architectTokensAvg ?? meta._architectTokens ?? 0,
      builder: meta._builderTokensAvg ?? meta._builderTokens ?? 0,
      critic: meta._criticTokensAvg ?? meta._criticTokens ?? 0,
    };

    // Compute staleness
    const stalenessSeconds = meta._generatedAt
      ? Math.round((Date.now() - new Date(meta._generatedAt).getTime()) / 1000)
      : null;
    const stalenessScore = computeStalenessScore(
      stalenessSeconds,
      meta._depth ?? 0,
      meta._emphasis ?? 1,
      config.depthWeight,
    );

    const owedPhase = getOwedPhase(phaseState);
    const priorityBand = getPriorityBand(phaseState);

    return {
      path: targetNode.metaPath,
      staleness: {
        seconds: stalenessSeconds,
        score: Math.round(stalenessScore * 100) / 100,
      },
      architectWillRun: architectTriggered,
      architectReason:
        [
          ...(architectInvalidators.includes('firstRun')
            ? ['no cached builder (first run)']
            : []),
          ...(architectInvalidators.includes('structureHash')
            ? ['structure changed']
            : []),
          ...(architectInvalidators.includes('steer') ? ['steer changed'] : []),
          ...(architectInvalidators.includes('_crossRefs')
            ? ['cross-refs changed']
            : []),
          ...(architectInvalidators.includes('architectEvery')
            ? ['periodic refresh']
            : []),
        ].join(', ') || 'not triggered',
      scope: {
        ownedFiles: scopeFiles.length,
        childMetas: targetNode.children.length,
        deltaFiles: deltaFiles
          .slice(0, config.previewDeltaFilesCap)
          .map((f) => ({ path: f, action: 'modified' as const })),
        deltaCount: deltaFiles.length,
        deltaFilesTruncated: deltaFiles.length > config.previewDeltaFilesCap,
      },
      estimatedTokens,
      // New phase-state fields (additive)
      owedPhase,
      priorityBand,
      phaseState,
      inputStatus,
      architectInvalidators,
    };
  });
}
