import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import copyPlugin from 'rollup-plugin-copy';

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const external = [
  '@karmaniverous/jeeves',
  '@karmaniverous/jeeves-meta-core',
  'commander',
  'croner',
  'fastify',
  'handlebars',
  'pino',
  'pino/file',
  'zod',
  'tslib',
  /^node:/,
];

const buildCli: RollupOptions = {
  input: 'src/cli.ts',
  external,
  onwarn,
  output: {
    dir: 'dist/cli/jeeves-meta',
    entryFileNames: 'index.js',
    format: 'esm',
    banner: '#!/usr/bin/env node',
    inlineDynamicImports: true,
  },
  plugins: [
    commonjsPlugin(),
    jsonPlugin(),
    nodeResolve(),
    typescriptPlugin({
      tsconfig: './tsconfig.json',
      outputToFilesystem: false,
      outDir: 'dist/cli/jeeves-meta',
      exclude: ['**/*.test.ts', '**/*.d.ts'],
      noEmit: false,
      declaration: false,
      incremental: false,
      rootDir: './src',
    }),
    // The prompt loader (src/prompts/index.ts) reads `<package root>/dist/prompts`.
    copyPlugin({
      targets: [{ src: 'src/prompts/*.md', dest: 'dist/prompts' }],
    }),
  ],
};

export default [buildCli];
