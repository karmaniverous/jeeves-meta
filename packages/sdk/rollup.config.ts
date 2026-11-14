/**
 * @module rollup.config
 * Rollup configuration for the jeeves-meta-sdk package.
 * Single entry point: src/index.ts, ESM output with declarations.
 */

import { readFileSync } from 'node:fs';

import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

interface PackageJson {
  dependencies?: Record<string, string>;
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageJson;

const dependencyExternals = Object.keys(pkg.dependencies ?? {});

const config: RollupOptions = {
  input: 'src/index.ts',
  external: [
    ...dependencyExternals,
    ...dependencyExternals.map((dep) => new RegExp('^' + dep + '/')),
    /^node:/,
  ],
  output: {
    dir: 'dist',
    format: 'esm',
  },
  plugins: [
    typescriptPlugin({
      // Sources only: tests are type-checked by tsconfig.json.
      tsconfig: './tsconfig.build.json',
      outputToFilesystem: false,
      noEmit: false,
      declaration: true,
      declarationDir: 'dist',
      declarationMap: false,
      incremental: false,
      rootDir: 'src',
      exclude: ['rollup.config.ts'],
    }),
  ],
};

export default config;
