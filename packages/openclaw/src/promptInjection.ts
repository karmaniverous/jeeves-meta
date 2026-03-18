/**
 * Generate the Meta menu content for TOOLS.md injection.
 *
 * Queries the jeeves-meta service for entity stats and produces
 * a Markdown section suitable for agent system prompt injection.
 *
 * @module promptInjection
 */

import type {
  MetaServiceClient,
  MetasResponse,
  StatusResponse,
} from './serviceClient.js';
import { renderToolsTable } from './toolMeta.js';

/** Fetch status and metas, returning null on failure. */
async function fetchServiceData(
  client: MetaServiceClient,
): Promise<{ status: StatusResponse; metas: MetasResponse } | null> {
  try {
    const [status, metas] = await Promise.all([
      client.status(),
      client.listMetas(),
    ]);
    return { status, metas };
  } catch {
    return null;
  }
}

/** Format a staleness value as a human-readable age string. */
function formatAge(seconds: number): string {
  if (!isFinite(seconds)) return 'never synthesized';
  if (seconds < 3600) return Math.round(seconds / 60).toString() + 'm';
  if (seconds < 86400) return Math.round(seconds / 3600).toString() + 'h';
  return Math.round(seconds / 86400).toString() + 'd';
}

/** Build dependency warning lines from service status. */
function buildDependencyLines(status: StatusResponse): string[] {
  const lines: string[] = [];
  const { watcher, gateway } = status.dependencies;

  if (watcher.status === 'indexing') {
    lines.push(
      '> ⏳ **Watcher indexing**: Initial filesystem scan in progress. Synthesis will resume when complete.',
    );
  } else if (watcher.status !== 'ok') {
    lines.push('> ⚠️ **Watcher**: ' + watcher.status);
  }

  if (watcher.rulesRegistered === false && watcher.status === 'ok') {
    lines.push(
      '> ⚠️ **Watcher rules not registered**: Meta files may not render properly in search/server.',
    );
  }

  if (gateway.status !== 'ok') {
    lines.push('> ⚠️ **Gateway**: ' + gateway.status);
  }

  return lines;
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
  const data = await fetchServiceData(client);

  if (!data) {
    return [
      '> **ACTION REQUIRED: jeeves-meta service is unreachable.**',
      '> The service API is down or not configured.',
      '>',
      '> **Troubleshooting:**',
      '> - Verify the service is installed: `npm list -g @karmaniverous/jeeves-meta`',
      '> - Check if running: `curl http://localhost:1938/status`',
      '> - Verify `serviceUrl` in plugin config if using a non-default port',
      '>',
      "> **Read the `jeeves-meta` skill's Bootstrapping section** for full setup guidance.",
    ].join('\n');
  }

  const { status, metas } = data;

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

  // Find stalest age across all metas
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

  const depLines = buildDependencyLines(status);

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
    ...(depLines.length > 0 ? ['', '### Dependencies', ...depLines] : []),
    '',
    renderToolsTable(),
  ].join('\n');
}
