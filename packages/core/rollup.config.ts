import { readFileSync } from 'node:fs';

import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageJson;

/** Every dependency stays external, including its sub-paths. */
const dependencyExternals = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.peerDependencies ?? {}),
];

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const buildLibrary: RollupOptions = {
  input: 'src/index.ts',
  external: [
    ...dependencyExternals,
    ...dependencyExternals.map((dep) => new RegExp('^' + dep + '/')),
    'tslib',
    /^node:/,
  ],
  onwarn,
  output: [{ dir: 'dist', format: 'esm' }],
  plugins: [
    commonjs(),
    nodeResolve({ extensions: ['.ts', '.js'] }),
    json(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: true,
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      noEmit: false,
      declaration: true,
      declarationDir: 'dist',
      declarationMap: false,
      incremental: false,
      rootDir: './src',
    }),
  ],
};

export default [buildLibrary];
