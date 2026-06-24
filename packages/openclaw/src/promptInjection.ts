/**
 * Generate the Meta menu content for TOOLS.md injection.
 *
 * Queries the jeeves-meta service for entity stats and produces
 * a Markdown section suitable for agent system prompt injection.
 *
 * @module promptInjection
 */

import { phaseNames, phaseStatuses } from '@karmaniverous/jeeves-meta-core';

import type {
  MetaServiceClient,
  MetasResponse,
  StatusResponse,
} from './serviceClient.js';

/** Phase statuses that require per-phase breakdown (everything except fresh). */
const nonFreshStatuses = phaseStatuses.filter((s) => s !== 'fresh');

/**
 * Format a duration in seconds as a compound human-readable interval.
 *
 * Produces at most two units: `2d 3h`, `1h 35m`, `45m`, etc.
 * Returns `'never synthesized'` for non-finite input.
 *
 * @param seconds - Duration in seconds.
 * @returns Formatted interval string.
 */
export function formatAge(seconds: number): string {
  if (!isFinite(seconds)) return 'never synthesized';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0 && h > 0) return `${d.toString()}d ${h.toString()}h`;
  if (d > 0) return `${d.toString()}d`;
  if (h > 0 && m > 0) return `${h.toString()}h ${m.toString()}m`;
  if (h > 0) return `${h.toString()}h`;
  return `${Math.max(m, 1).toString()}m`;
}

/**
 * Generate the Meta menu Markdown for TOOLS.md.
 *
 * @param client - MetaServiceClient instance.
 * @returns Markdown string for the Meta section.
 */
export async function generateMetaMenu(
  client: MetaServiceClient,
): Promise<string> {
  const [status, metas]: [StatusResponse, MetasResponse] = await Promise.all([
    client.status(),
    client.listMetas(),
  ]);

  if (metas.summary.total === 0) {
    return [
      '> **ACTION REQUIRED: No synthesis entities found.**',
      '> The service is running but no `.meta/` directories were discovered.',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrapping section** for guidance",
      '> on creating `.meta/` directories.',
    ].join('\n');
  }

  const { summary } = metas;

  // Find stalest age
  let stalestAge = 0;
  for (const item of metas.metas) {
    const s = item.stalenessSeconds !== null ? item.stalenessSeconds : Infinity;
    if (s > stalestAge) stalestAge = s;
  }

  const stalestDisplay = summary.stalestPath
    ? summary.stalestPath + ' (' + formatAge(stalestAge) + ')'
    : 'n/a';
  const lastSynthDisplay = summary.lastSynthesizedAt
    ? (summary.lastSynthesizedPath ?? '') +
      ' (' +
      summary.lastSynthesizedAt +
      ')'
    : 'n/a';

  // Service status + dependency health
  // The core SDK's createStatusHandler nests getHealth() under `health`.
  const { dependencies } = status.health;
  const depLines: string[] = [];
  if (dependencies.watcher.status === 'indexing') {
    depLines.push(
      '> ⏳ **Watcher indexing**: Initial filesystem scan in progress. Synthesis will resume when complete.',
    );
  } else if (
    dependencies.watcher.status !== 'ok' &&
    dependencies.watcher.status !== 'indexing'
  ) {
    depLines.push('> ⚠️ **Watcher**: ' + dependencies.watcher.status);
  }
  if (
    dependencies.watcher.rulesRegistered === false &&
    dependencies.watcher.status === 'ok'
  ) {
    depLines.push(
      '> ⚠️ **Watcher rules not registered**: Meta files may not render properly in search/server.',
    );
  }
  if (dependencies.gateway.status !== 'ok') {
    depLines.push('> ⚠️ **Gateway**: ' + dependencies.gateway.status);
  }

  // Phase-state summary from /status health
  const phaseLines: string[] = [];
  const phaseSummary = status.health.phaseStateSummary;
  if (phaseSummary) {
    // Fresh counts are aggregated; non-fresh show <count> <state> <phase>
    let freshTotal = 0;
    for (const phase of phaseNames) {
      freshTotal += phaseSummary[phase].fresh;
    }
    const parts: string[] = [];
    if (freshTotal > 0) parts.push(freshTotal.toString() + ' fresh');
    for (const phase of phaseNames) {
      for (const state of nonFreshStatuses) {
        const count = phaseSummary[phase][state];
        if (count > 0) parts.push(`${count.toString()} ${state} ${phase}`);
      }
    }
    if (parts.length > 0) {
      phaseLines.push('Phases: ' + parts.join(', '));
    }

    // Failed-phase alert
    const failedParts: string[] = [];
    for (const item of metas.metas) {
      const ps = item.phaseState as Record<string, string> | undefined;
      if (!ps) continue;
      for (const phase of phaseNames) {
        if (ps[phase] === 'failed') {
          const p = item.path as string;
          failedParts.push(p + ' (' + phase + ')');
        }
      }
    }
    if (failedParts.length > 0) {
      phaseLines.push(
        '⚠ Failed: ' +
          failedParts.slice(0, 10).join(', ') +
          (failedParts.length > 10
            ? ' (+' + (failedParts.length - 10).toString() + ' more)'
            : ''),
      );
    }
  }

  // Next-phase indicator from /status health
  const nextPhase = status.health.nextPhase;
  if (nextPhase) {
    phaseLines.push(
      'Next: ' +
        nextPhase.path +
        ' → ' +
        nextPhase.phase +
        ' (band ' +
        nextPhase.band.toString() +
        ', staleness ' +
        formatAge(nextPhase.staleness) +
        ')',
    );
  }

  return [
    'The jeeves-meta synthesis engine manages ' +
      summary.total.toString() +
      ' meta entities.',
    '',
    '### Entity Summary',
    '| Metric | Value |',
    '|--------|-------|',
    '| Total | ' + summary.total.toString() + ' |',
    '| Stale | ' + summary.stale.toString() + ' |',
    '| Errors | ' + summary.errors.toString() + ' |',
    '| Never synthesized | ' + summary.neverSynthesized.toString() + ' |',
    '| Stalest | ' + stalestDisplay + ' |',
    '| Last synthesized | ' + lastSynthDisplay + ' |',
    ...(phaseLines.length > 0 ? ['', '### Phase State', ...phaseLines] : []),
    ...(depLines.length > 0 ? ['', '### Dependencies', ...depLines] : []),
    '',
    'Read the `jeeves-meta` skill for usage guidance, configuration, and troubleshooting.',
  ].join('\n');
}
