/**
 * Abstraction over the jeeves-watcher HTTP API.
 *
 * The orchestrator uses this for structured queries (POST /scan)
 * and virtual rule registration. Subprocesses use watcher_search
 * directly via tools.
 *
 * @module interfaces/WatcherClient
 */

/** An inference rule to register with the watcher. */
export interface InferenceRuleSpec {
  /** Rule name. */
  name: string;
  /** Rule description. */
  description: string;
  /** JSON Schema match criteria. */
  match: Record<string, unknown>;
  /** Schema array with set keywords. */
  schema: unknown[];
  /** Declarative render config. */
  render?: Record<string, unknown>;
  /** Handlebars template name. */
  template?: string;
  /** Render output format. */
  renderAs?: string;
}

/**
 * Interface for watcher HTTP operations.
 *
 * Implementations handle retry with backoff internally.
 */
export interface WatcherClient {
  /**
   * Register virtual inference rules with the watcher.
   *
   * @param source - Source identifier (e.g. 'jeeves-meta').
   * @param rules - Array of inference rules to register.
   */
  registerRules(source: string, rules: InferenceRuleSpec[]): Promise<void>;

  /**
   * Walk filesystem using glob patterns.
   *
   * @param globs - Array of glob patterns to match against.
   * @returns Promise resolving to array of matching file paths.
   */
  walk(globs: string[]): Promise<string[]>;
}
