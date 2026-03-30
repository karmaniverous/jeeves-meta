/**
 * Error thrown when a spawned subprocess is aborted via AbortController.
 *
 * @module executor/SpawnAbortedError
 */

/** Error indicating a spawn was deliberately aborted. */
export class SpawnAbortedError extends Error {
  constructor(message = 'Synthesis was aborted') {
    super(message);
    this.name = 'SpawnAbortedError';
  }
}
