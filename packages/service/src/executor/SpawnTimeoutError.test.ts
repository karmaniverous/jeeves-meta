import { describe, expect, it } from 'vitest';

import { SpawnTimeoutError } from './SpawnTimeoutError.js';

describe('SpawnTimeoutError', () => {
  it('carries outputPath and extends Error', () => {
    const err = new SpawnTimeoutError('timed out', '/tmp/output.json');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('SpawnTimeoutError');
    expect(err.message).toBe('timed out');
    expect(err.outputPath).toBe('/tmp/output.json');
  });
});
