/**
 * Structured error from a synthesis step failure.
 *
 * @module schema/error
 */

import { z } from 'zod';

/**
 * Valid synthesis step names.
 *
 * - `architect` — the task brief generation step
 * - `builder` — the content synthesis step
 * - `critic` — the quality review step
 */
export const synthSteps = ['architect', 'builder', 'critic'] as const;

/** A synthesis step name: 'architect', 'builder', or 'critic'. */
export type SynthStep = (typeof synthSteps)[number];

/** Zod schema for synthesis step errors. */
export const synthErrorSchema = z.object({
  /** Which step failed. */
  step: z.enum(synthSteps),
  /** Error classification code. */
  code: z.string(),
  /** Human-readable error message. */
  message: z.string(),
});

/** Inferred type for synthesis step errors. */
export type SynthError = z.infer<typeof synthErrorSchema>;
