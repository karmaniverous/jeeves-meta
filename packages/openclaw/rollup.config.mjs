/**
 * Rollup configuration for the OpenClaw plugin package.
 * Two entry points: plugin (ESM + declarations) and CLI (ESM executable).
 *
 * `@karmaniverous/jeeves` is BUNDLED into the plugin output — the plugin
 * runs in OpenClaw's extensions directory where node_modules is not
 * reliably available. All other node: builtins are externalized.
 */

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';

function onwarn(warning, warn) {
  if (warning?.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
}

const pluginConfig = {
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm' },
  external: ['@karmaniverous/jeeves-meta', /^node:/],
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

const cliConfig = {
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
