/**
 * Phase vocabulary for the jeeves-meta synthesis pipeline.
 *
 * Defines the ordered phase names, their possible statuses, and the
 * per-meta phase state record used by the engine and consumers.
 *
 */

import { z } from 'zod';

/** Phase names in pipeline order. */
export const phaseNames = ['architect', 'builder', 'critic'] as const;

/** A single synthesis phase name. */
export type PhaseName = (typeof phaseNames)[number];

/** Valid states for a synthesis phase. */
export const phaseStatuses = [
  'fresh',
  'stale',
  'pending',
  'running',
  'failed',
] as const;

/** A single phase status value. */
export type PhaseStatus = (typeof phaseStatuses)[number];

/** Per-phase state record. */
export type PhaseState = Record<PhaseName, PhaseStatus>;

/** Zod schema for a per-phase status value. */
export const phaseStatusSchema = z.enum(phaseStatuses);

/** Zod schema for the per-meta phase state record. */
export const phaseStateSchema = z.object({
  architect: phaseStatusSchema,
  builder: phaseStatusSchema,
  critic: phaseStatusSchema,
});
