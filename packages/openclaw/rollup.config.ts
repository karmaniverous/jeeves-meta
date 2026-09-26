/**
 * Rollup configuration for the OpenClaw plugin package.
 * Single entry point: the plugin (ESM + declarations).
 *
 * Runtime dependencies (`@karmaniverous/jeeves`, `@karmaniverous/jeeves-meta`)
 * are externalized and resolved from the plugin's installed dependencies.
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

export default [pluginConfig];
