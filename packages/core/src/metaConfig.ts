/** Zod schema for the core (library-compatible) meta configuration. */

import { z } from 'zod';

/** Zod schema for the core (library-compatible) meta configuration. */
export const metaConfigSchema = z.object({
  /** Watcher service base URL. */
  watcherUrl: z.url(),

  /** OpenClaw gateway base URL for subprocess spawning. */
  gatewayUrl: z.url().default('http://127.0.0.1:18789'),

  /** Optional API key for gateway authentication. */
  gatewayApiKey: z.string().optional(),

  /** Run architect every N cycles (per meta). */
  architectEvery: z.number().int().min(1).default(10),

  /** Exponent for depth weighting in staleness formula. */
  depthWeight: z.number().min(0).default(0.5),

  /** Maximum archive snapshots to retain per meta. */
  maxArchive: z.number().int().min(1).default(20),

  /** Maximum lines of context to include in subprocess prompts. */
  maxLines: z.number().int().min(50).default(500),

  /** Architect subprocess timeout in seconds. */
  architectTimeout: z.number().int().min(30).default(180),

  /** Builder subprocess timeout in seconds. */
  builderTimeout: z.number().int().min(60).default(360),

  /** Critic subprocess timeout in seconds. */
  criticTimeout: z.number().int().min(30).default(240),

  /** Thinking level for spawned synthesis sessions. */
  thinking: z.string().default('low'),

  /** Resolved architect system prompt text. Falls back to built-in default. */
  defaultArchitect: z.string().optional(),

  /** Resolved critic system prompt text. Falls back to built-in default. */
  defaultCritic: z.string().optional(),

  /** Skip unchanged candidates, bump _generatedAt. */
  skipUnchanged: z.boolean().default(true),

  /** Watcher metadata properties applied to live .meta/meta.json files. */
  metaProperty: z.record(z.string(), z.unknown()).default({ _meta: 'current' }),

  /** Watcher metadata properties applied to archive snapshots. */
  metaArchiveProperty: z
    .record(z.string(), z.unknown())
    .default({ _meta: 'archive' }),
});

/** Inferred type for core meta configuration. */
export type MetaConfig = z.infer<typeof metaConfigSchema>;
