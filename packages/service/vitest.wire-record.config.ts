/**
 * Vitest config for recording the wire baseline: runs only
 * `src/test/wire/wireRecord.record.ts`, which writes every scenario's reply
 * to the file named by `WIRE_RECORD`. Used by `npm run wire:record` and
 * `scripts/capture-wire.ts`; not part of `npm test`.
 *
 * @module vitest.wire-record.config
 */
import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config.js';

export default mergeConfig(
  base,
  defineConfig({
    test: { include: ['src/test/wire/wireRecord.record.ts'] },
  }),
);
