/**
 * `metaHealthSchema` (Decision 204): the `health` object jeeves-meta's
 * `GET /status` sends, field for field as the 0.19.0 handler builds it, or
 * jeeves' degraded `{ error }` when the health check throws. Pure.
 *
 * @module catalog/health
 */

import { z } from 'zod';

import { phaseNames, phaseStatuses } from '../phases.js';

/** Counts of each phase status for one phase. */
const phaseCountsSchema = z.object(
  Object.fromEntries(phaseStatuses.map((s) => [s, z.number()])) as Record<
    (typeof phaseStatuses)[number],
    z.ZodNumber
  >,
);

/** Per-phase status counts across the corpus. */
const phaseStateSummarySchema = z.object(
  Object.fromEntries(phaseNames.map((p) => [p, phaseCountsSchema])) as Record<
    (typeof phaseNames)[number],
    typeof phaseCountsSchema
  >,
);

/** A dependency check result. */
const dependencySchema = {
  /** The dependency's base URL. */
  url: z.string(),
  /** When it was checked (ISO 8601). */
  checkedAt: z.string(),
};

/** The full health object. */
const metaHealthDetailSchema = z.object({
  /** What the service is doing. */
  serviceState: z.enum(['idle', 'synthesizing', 'waiting', 'stopping']),
  /** Path of the meta being synthesized, if any. */
  currentTarget: z.string().nullable(),
  /** Override queue. */
  queue: z.object({
    /** Number of queued overrides. */
    depth: z.number(),
    /** Queued overrides. */
    items: z.array(z.object({ path: z.string(), enqueuedAt: z.string() })),
  }),
  /** Totals since start. */
  stats: z.object({
    totalSyntheses: z.number(),
    totalTokens: z.number(),
    totalErrors: z.number(),
    lastCycleDurationMs: z.number().nullable(),
    lastCycleAt: z.string().nullable(),
  }),
  /** Scheduler. */
  schedule: z.object({
    /** Cron expression. */
    expression: z.string(),
    /** Next run (ISO 8601), if scheduled. */
    nextAt: z.string().nullable(),
  }),
  /** Dependency checks. */
  dependencies: z.object({
    /** jeeves-watcher. */
    watcher: z.object({
      ...dependencySchema,
      status: z.enum(['ok', 'indexing', 'error', 'unreachable']),
      /** Whether the watcher's initial scan is running (#244). */
      indexing: z.boolean().optional(),
      /** Whether meta's inference rules are registered. */
      rulesRegistered: z.boolean(),
    }),
    /** OpenClaw gateway. */
    gateway: z.object({
      ...dependencySchema,
      status: z.enum(['ok', 'error', 'unreachable']),
    }),
  }),
  /** Phase status counts; zero when the watcher is unreachable. */
  phaseStateSummary: phaseStateSummarySchema,
  /** The phase the scheduler would run next, if any. */
  nextPhase: z
    .object({
      path: z.string(),
      phase: z.enum(phaseNames),
      band: z.number(),
      staleness: z.number(),
    })
    .nullable(),
  /** Corpus counts; `null` when the watcher is unreachable. */
  metaCounts: z
    .object({
      total: z.number(),
      enabled: z.number(),
      disabled: z.number(),
      neverSynthesized: z.number(),
      stale: z.number(),
      errors: z.number(),
      locked: z.number(),
    })
    .nullable(),
});

/** `GET /status` `health`: the full object, or jeeves' degraded reply. */
export const metaHealthSchema = z.union([
  metaHealthDetailSchema,
  z.object({ error: z.string() }),
]);
