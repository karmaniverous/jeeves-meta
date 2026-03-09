/**
 * Pluggable executor interface for LLM subprocess invocation.
 *
 * @module interfaces/SynthExecutor
 */

/** Options for spawning a synthesis subprocess. */
export interface SynthSpawnOptions {
  /** Model override for this subprocess. */
  model?: string;
  /** Timeout in seconds. */
  timeout?: number;
}

/** Result of a spawn call, including optional token usage. */
export interface SynthSpawnResult {
  /** Subprocess output text. */
  output: string;
  /** Token count for this call, if available from the executor. */
  tokens?: number;
}

/**
 * Interface for spawning synthesis subprocesses.
 *
 * The executor abstracts the LLM invocation mechanism. The orchestrator
 * calls spawn() sequentially for architect, builder, and critic steps.
 * Each call blocks until the subprocess completes and returns its result.
 */
export interface SynthExecutor {
  /**
   * Spawn a subprocess with the given task prompt.
   *
   * @param task - Full task prompt for the subprocess.
   * @param options - Optional model and timeout overrides.
   * @returns The subprocess result with output and optional token count.
   */
  spawn(task: string, options?: SynthSpawnOptions): Promise<SynthSpawnResult>;
}
