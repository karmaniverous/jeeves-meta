/**
 * Request schemas of the jeeves-meta API: the service's 0.19.0 Zod schemas,
 * moved to core unchanged in what they accept (spec 4.4.1), plus the
 * `preview` query. Boolean query flags end in `.pipe(z.boolean())` so the
 * schema converts to JSON Schema in output mode; they still accept exactly
 * `true` and `false`. Pure.
 *
 * @module catalog/requests
 */

import { z } from 'zod';

/** A `true`/`false` query flag, parsed to a boolean. */
const boolQueryParam = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .pipe(z.boolean());

/** `GET /metas` query. */
export const metasQuerySchema = z.object({
  /** Only metas whose path starts with this prefix. */
  pathPrefix: z.string().optional().describe('Only metas under this path.'),
  /** Only metas with (`true`) or without (`false`) an error. */
  hasError: boolQueryParam.optional().describe('Filter by error state.'),
  /** Only metas at least this many hours stale. */
  staleHours: z
    .string()
    .transform(Number)
    .pipe(z.number().positive())
    .optional()
    .describe('Only metas at least this many hours stale.'),
  /** Only metas never synthesized (`true`) or synthesized (`false`). */
  neverSynthesized: boolQueryParam
    .optional()
    .describe('Filter by never-synthesized state.'),
  /** Only locked (`true`) or unlocked (`false`) metas. */
  locked: boolQueryParam.optional().describe('Filter by lock state.'),
  /** Only disabled (`true`) or enabled (`false`) metas. */
  disabled: boolQueryParam.optional().describe('Filter by disabled state.'),
  /** Comma-separated fields to project on each item. */
  fields: z
    .string()
    .optional()
    .describe('Comma-separated fields to return for each meta.'),
});

/** `GET /metas/:path` query. */
export const metaDetailQuerySchema = z.object({
  /** Comma-separated `meta.json` fields to project. */
  fields: z
    .string()
    .optional()
    .describe('Comma-separated meta.json fields to return.'),
  /**
   * `true` for the whole archive, `false` for none, or the number of
   * entries (one string schema: catalog query fields cannot be unions).
   */
  includeArchive: z
    .string()
    .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v)))
    .pipe(z.union([z.boolean(), z.number().int().nonnegative()]))
    .optional()
    .describe('true for all archive entries, or how many to return.'),
});

/** `PATCH /metas/:path` body: user-settable reserved properties (strict). */
export const updateBodySchema = z
  .object({
    /** Steering prompt; `null` removes it. */
    _steer: z.union([z.string(), z.null()]).optional(),
    /** Scheduling emphasis (at least 0); `null` removes it. */
    _emphasis: z.union([z.number().min(0), z.null()]).optional(),
    /** Depth override; `null` removes it. */
    _depth: z.union([z.number(), z.null()]).optional(),
    /** Cross-referenced owner paths; `null` removes them. */
    _crossRefs: z.union([z.array(z.string()), z.null()]).optional(),
    /** Disable scheduling; `null` removes the flag. */
    _disabled: z.union([z.boolean(), z.null()]).optional(),
  })
  .strict();

/** `POST /seed` body. */
export const seedBodySchema = z.object({
  /** Owner path to create `.meta/` under. */
  path: z.string().min(1),
  /** Initial cross-references. */
  crossRefs: z.array(z.string()).optional(),
  /** Initial steering prompt. */
  steer: z.string().optional(),
});

/** `POST /synthesize` body. */
export const synthesizeBodySchema = z.object({
  /** Owner or `.meta/` path to synthesize; omitted: the stalest meta. */
  path: z.string().optional(),
});

/** `POST /unlock` body. */
export const unlockBodySchema = z.object({
  /** Owner or `.meta/` path whose `.lock` to remove. */
  path: z.string().min(1),
});

/** `GET /preview` query. */
export const previewQuerySchema = z.object({
  /** Owner or `.meta/` path to preview; omitted: the stalest meta. */
  path: z
    .string()
    .optional()
    .describe('Meta path to preview (default: the stalest meta).'),
});
