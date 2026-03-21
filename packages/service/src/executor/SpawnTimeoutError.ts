/**
 * Error thrown when a spawned subprocess times out.
 *
 * Carries the output file path so callers can attempt partial output recovery.
 *
 * @module executor/SpawnTimeoutError
 */

/** Error indicating a spawn timeout with a recoverable output path. */
export class SpawnTimeoutError extends Error {
  /** Path to the (possibly partial) output file written before timeout. */
  readonly outputPath: string;

  constructor(message: string, outputPath: string) {
    super(message);
    this.name = 'SpawnTimeoutError';
    this.outputPath = outputPath;
  }
}
