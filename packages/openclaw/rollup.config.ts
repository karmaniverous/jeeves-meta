/**
 * Rollup configuration for the OpenClaw plugin package.
 * Single entry point: the plugin (ESM + declarations).
 *
 * Every runtime dependency (and its sub-paths) is externalized and resolved
 * from the plugin's installed dependencies.
 */

import { readFileSync } from 'node:fs';

import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { dependencies?: Record<string, string> };

const dependencyExternals = Object.keys(pkg.dependencies ?? {});

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const pluginConfig: RollupOptions = {
  input: 'src/index.ts',
  output: { dir: 'dist', format: 'esm' },
  external: [
    ...dependencyExternals,
    ...dependencyExternals.map((dep) => new RegExp('^' + dep + '/')),
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
      // Type against the built core package, not the source path mapping
      // used by typecheck/tests (see tsconfig.json).
      paths: {},
    }),
  ],
};

export default [pluginConfig];
