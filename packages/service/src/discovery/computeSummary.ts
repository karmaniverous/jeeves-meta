/**
 * Compute summary statistics from an array of MetaEntry objects.
 *
 * Shared between listMetas() (full list) and route handlers (filtered lists).
 *
 * @module discovery/computeSummary
 */

import type { MetaEntry, MetaListSummary } from './listMetas.js';

/**
 * Compute summary statistics from a list of meta entries.
 *
 * @param entries - Enriched meta entries (full or filtered).
 * @param depthWeight - Config depth weight for effective staleness calculation.
 * @returns Aggregated summary statistics.
 */
export function computeSummary(
  entries: MetaEntry[],
  depthWeight: number,
): MetaListSummary {
  let staleCount = 0;
  let errorCount = 0;
  let lockedCount = 0;
  let disabledCount = 0;
  let neverSynthesizedCount = 0;
  let totalArchitectTokens = 0;
  let totalBuilderTokens = 0;
  let totalCriticTokens = 0;
  let stalestPath: string | null = null;
  let stalestEffective = -1;
  let lastSynthesizedPath: string | null = null;
  let lastSynthesizedAt: string | null = null;

  for (const e of entries) {
    if (e.stalenessSeconds > 0) staleCount++;
    if (e.hasError) errorCount++;
    if (e.locked) lockedCount++;
    if (e.disabled) disabledCount++;
    if (e.lastSynthesized === null) neverSynthesizedCount++;

    totalArchitectTokens += e.architectTokens ?? 0;
    totalBuilderTokens += e.builderTokens ?? 0;
    totalCriticTokens += e.criticTokens ?? 0;

    // Track last synthesized
    if (
      e.lastSynthesized &&
      (!lastSynthesizedAt || e.lastSynthesized > lastSynthesizedAt)
    ) {
      lastSynthesizedAt = e.lastSynthesized;
      lastSynthesizedPath = e.path;
    }

    // Track stalest (effective staleness for scheduling)
    const depthFactor = Math.pow(1 + depthWeight, e.depth);
    const effectiveStaleness = e.stalenessSeconds * depthFactor * e.emphasis;
    if (effectiveStaleness > stalestEffective) {
      stalestEffective = effectiveStaleness;
      stalestPath = e.path;
    }
  }

  return {
    total: entries.length,
    stale: staleCount,
    errors: errorCount,
    locked: lockedCount,
    disabled: disabledCount,
    neverSynthesized: neverSynthesizedCount,
    tokens: {
      architect: totalArchitectTokens,
      builder: totalBuilderTokens,
      critic: totalCriticTokens,
    },
    stalestPath,
    lastSynthesizedPath,
    lastSynthesizedAt,
  };
}
