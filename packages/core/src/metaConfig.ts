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

  /** Thinking level for spawned synthesis sessions. */
  thinking: z.string().default('low'),

  /** Skip unchanged candidates, bump _generatedAt. */
  skipUnchanged: z.boolean().default(true),

  /** Watcher metadata properties applied to live .meta/meta.json files. No default — set by installer. */
  metaProperty: z.record(z.string(), z.unknown()),

  /** Watcher metadata properties applied to archive snapshots. No default — set by installer. */
  metaArchiveProperty: z.record(z.string(), z.unknown()),
});

/** Inferred type for core meta configuration. */
export type MetaConfig = z.infer<typeof metaConfigSchema>;
