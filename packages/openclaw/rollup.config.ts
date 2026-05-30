/**
 * Rollup configuration for the OpenClaw plugin package.
 * Two entry points: plugin (ESM + declarations) and CLI (ESM executable).
 *
 * Runtime dependencies (`@karmaniverous/jeeves`, `@karmaniverous/jeeves-meta`)
 * are externalized — the OpenClaw host environment provides them.
 * CLI bundles everything for standalone execution.
 */

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const pluginConfig: RollupOptions = {
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm' },
  external: [
    '@karmaniverous/jeeves',
    '@karmaniverous/jeeves-meta',
    '@karmaniverous/jeeves-meta-core',
    /^node:/,
  ],
  onwarn,
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      noEmit: false,
      declaration: true,
      declarationDir: 'dist',
      declarationMap: false,
      incremental: false,
    }),
  ],
};

const cliConfig: RollupOptions = {
  input: 'src/cli.ts',
  external: [/^node:/],
  onwarn,
  output: {
    file: 'dist/cli.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
  },
  plugins: [
    resolve({ preferBuiltins: true }),
    commonjs(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      outDir: 'dist',
      noEmit: false,
      declaration: false,
      incremental: false,
    }),
  ],
};

export default [pluginConfig, cliConfig];
