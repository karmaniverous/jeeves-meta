/**
 * Response schemas of the jeeves-meta API, field for field as the 0.19.0
 * handlers send them and as `wire-0.19.0.json` recorded them (Decision
 * 200). Bodies that carry `meta.json` content are loose objects; the
 * `synthesize`, `abort` and `preview` responses are unions of their shapes.
 * Pure.
 *
 * @module catalog/responses
 */

import { z } from 'zod';

import { phaseNames, phaseStateSchema } from '../phases.js';

/** A phase name, or `null` when a meta owes nothing. */
const owedPhase = () => z.enum(phaseNames).nullable();

/** Per-phase token counts. */
const tokensSchema = z.object({
  architect: z.number(),
  builder: z.number(),
  critic: z.number(),
});

/** `meta.json` content, projected; user properties pass through. */
const metaContentSchema = z.looseObject({});

/** `GET /metas` summary over the filtered metas. */
export const metaListSummarySchema = z.object({
  total: z.number(),
  stale: z.number(),
  errors: z.number(),
  locked: z.number(),
  disabled: z.number(),
  neverSynthesized: z.number(),
  tokens: tokensSchema,
  stalestPath: z.string().nullable(),
  lastSynthesizedPath: z.string().nullable(),
  lastSynthesizedAt: z.string().nullable(),
});

/** A `GET /metas` item: the fields chosen by `fields` (default set shown). */
export const metasItemSchema = z.looseObject({
  path: z.string().optional(),
  depth: z.number().optional(),
  emphasis: z.number().optional(),
  /** `null` when never synthesized. */
  stalenessSeconds: z.number().nullable().optional(),
  lastSynthesized: z.string().nullable().optional(),
  hasError: z.boolean().optional(),
  locked: z.boolean().optional(),
  disabled: z.boolean().optional(),
  architectTokens: z.number().nullable().optional(),
  builderTokens: z.number().nullable().optional(),
  criticTokens: z.number().nullable().optional(),
  phaseState: phaseStateSchema.optional(),
  owedPhase: owedPhase().optional(),
});

/** `GET /metas` response. */
export const metasResponseSchema = z.object({
  summary: metaListSummarySchema,
  metas: z.array(metasItemSchema),
});

/** A cross-reference's status in `GET /metas/:path`. */
const crossRefStatusSchema = z.union([
  z.object({
    path: z.string(),
    status: z.literal('resolved'),
    hasContent: z.boolean(),
  }),
  z.object({ path: z.string(), status: z.literal('missing') }),
]);

/** `GET /metas/:path` response. */
export const metaDetailResponseSchema = z.object({
  /** The `.meta/` path. */
  path: z.string(),
  meta: metaContentSchema,
  scope: z.object({
    ownedFiles: z.number(),
    childMetas: z.number(),
    totalFiles: z.number(),
  }),
  staleness: z.object({ seconds: z.number().nullable(), score: z.number() }),
  phaseState: phaseStateSchema.nullable(),
  owedPhase: owedPhase(),
  /** Present when the meta declares cross-references. */
  crossRefs: z.array(crossRefStatusSchema).optional(),
  /** Present when `includeArchive` is set: projected archive snapshots. */
  archive: z.array(metaContentSchema).optional(),
});

/** `PATCH /metas/:path` response. */
export const updateMetaResponseSchema = z.object({
  path: z.string(),
  meta: metaContentSchema,
});

/** `POST /synthesize` responses (202 queued; 200 skipped, two shapes). */
export const synthesizeResponseSchema = z.union([
  z.object({
    status: z.literal('queued'),
    path: z.string(),
    /** `null` for a path with no `.meta/`. */
    owedPhase: owedPhase(),
    queuePosition: z.number(),
    alreadyQueued: z.boolean(),
  }),
  z.object({
    status: z.literal('skipped'),
    path: z.string(),
    owedPhase: z.null(),
    queuePosition: z.literal(-1),
    alreadyQueued: z.literal(false),
  }),
  z.object({ status: z.literal('skipped'), message: z.string() }),
]);

/** `POST /synthesize/abort` responses. */
export const abortResponseSchema = z.union([
  z.object({
    status: z.literal('aborted'),
    path: z.string(),
    phase: z.enum(phaseNames),
  }),
  z.object({ status: z.literal('idle') }),
]);

/** `GET /preview` detail for the meta that would run. */
const previewDetailSchema = z.object({
  path: z.string(),
  staleness: z.object({ seconds: z.number().nullable(), score: z.number() }),
  architectWillRun: z.boolean(),
  architectReason: z.string(),
  scope: z.object({
    ownedFiles: z.number(),
    childMetas: z.number(),
    deltaFiles: z.array(
      z.object({ path: z.string(), action: z.literal('modified') }),
    ),
    deltaCount: z.number(),
    deltaFilesTruncated: z.boolean(),
  }),
  estimatedTokens: tokensSchema,
  owedPhase: owedPhase(),
  priorityBand: z.number(),
  phaseState: phaseStateSchema,
  inputStatus: z.object({
    structureHash: z.string(),
    steerChanged: z.boolean(),
    architectChanged: z.boolean(),
    criticChanged: z.boolean(),
    crossRefsDeclChanged: z.boolean(),
    crossRefContentChanged: z.boolean(),
  }),
  architectInvalidators: z.array(z.string()),
});

/** `GET /preview` responses: the detail, or `{ message }` if nothing is stale. */
export const previewResponseSchema = z.union([
  previewDetailSchema,
  z.object({ message: z.string() }),
]);

/** `POST /seed` 201 response. */
export const seedResponseSchema = z.object({
  status: z.literal('created'),
  path: z.string(),
  metaDir: z.string(),
  _id: z.string(),
});

/** `POST /unlock` response. */
export const unlockResponseSchema = z.object({
  status: z.literal('unlocked'),
  path: z.string(),
});

/** `POST /config/apply` response (Decision 203). */
export const configApplyResponseSchema = z.object({
  applied: z.literal(true),
  restartRequired: z.boolean(),
  warning: z.string().optional(),
});

/** `GET /queue` response. */
export const queueResponseSchema = z.object({
  current: z
    .object({
      path: z.string(),
      phase: z.enum(phaseNames),
      startedAt: z.string(),
    })
    .nullable(),
  pending: z.array(
    z.object({
      path: z.string(),
      owedPhase: owedPhase(),
      enqueuedAt: z.string(),
    }),
  ),
  automatic: z.array(
    z.object({
      path: z.string(),
      owedPhase: z.enum(phaseNames),
      priorityBand: z.number(),
      effectiveStaleness: z.number(),
    }),
  ),
});

/** `POST /queue/clear` response. */
export const queueClearResponseSchema = z.object({ cleared: z.number() });
