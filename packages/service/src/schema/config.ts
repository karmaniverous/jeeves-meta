/**
 * Zod schema for jeeves-meta service configuration.
 *
 * The service config is a strict superset of the core (library-compatible) meta config.
 *
 * @module schema/config
 */

import {
  type MetaConfig,
  metaConfigSchema,
} from '@karmaniverous/jeeves-meta-core';
import { z } from 'zod';

export { type MetaConfig, metaConfigSchema };

/** Zod schema for logging configuration. */
const loggingSchema = z.object({
  /** Log level. */
  level: z.string().default('info'),

  /** Optional file path for log output. */
  file: z.string().optional(),
});

/** Zod schema for a single auto-seed policy rule. */
const autoSeedRuleSchema = z.object({
  /** Glob pattern matched against watcher walk results. */
  match: z.string(),
  /** Optional steering prompt for seeded metas. */
  steer: z.string().optional(),
  /** Optional cross-references for seeded metas. */
  crossRefs: z.array(z.string()).optional(),
});

/** Inferred type for an auto-seed rule. */
export type AutoSeedRule = z.infer<typeof autoSeedRuleSchema>;

/** Zod schema for jeeves-meta service configuration (superset of MetaConfig). */
export const serviceConfigSchema = metaConfigSchema.extend({
  /** HTTP port for the service (default: 1938). */
  port: z.number().int().min(1).max(65535).default(1938),

  /** Cron schedule for synthesis cycles (default: every 30 min). */
  schedule: z.string().default('*/30 * * * *'),

  /** Messaging channel name (e.g. 'slack'). Legacy: also used as target if reportTarget is unset. */
  reportChannel: z.string().optional(),

  /** Channel/user ID to send progress messages to. */
  reportTarget: z.string().optional(),

  /** Optional base URL for the service, used to construct entity links in progress reports. */
  serverBaseUrl: z.string().optional(),

  /** Interval in ms for periodic watcher health check. 0 = disabled. Default: 60000. */
  watcherHealthIntervalMs: z.number().int().min(0).default(60_000),

  /** Logging configuration. */
  logging: loggingSchema.default(() => loggingSchema.parse({})),

  /** Max number of all-fresh candidates to scan per tick in Tier 2 invalidation. */
  tier2ScanLimit: z.number().int().min(1).default(50),

  /**
   * Auto-seed policy: declarative rules for auto-creating .meta/ directories.
   * Rules are evaluated in order; last match wins for steer/crossRefs.
   */
  autoSeed: z.array(autoSeedRuleSchema).optional().default([]),
});

/** Inferred type for service configuration. */
export type ServiceConfig = z.infer<typeof serviceConfigSchema>;
