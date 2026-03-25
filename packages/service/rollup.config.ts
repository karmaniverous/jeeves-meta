import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';
import copyPlugin from 'rollup-plugin-copy';
import dtsPlugin from 'rollup-plugin-dts';

const typescript = typescriptPlugin({
  tsconfig: './tsconfig.json',
  outputToFilesystem: false,
  include: ['src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
  noEmit: false,
  declaration: false,
  declarationMap: false,
  incremental: false,
  allowJs: false,
  checkJs: false,
});

const buildLibrary: RollupOptions = {
  input: 'src/index.ts',
  external: [
    'commander',
    'croner',
    'fastify',
    'handlebars',
    'pino',
    'pino/file',
    'zod',
    'tslib',
    'node:fs',
    'node:path',
    'node:process',
    'node:url',
  ],
  output: [{ dir: 'dist', extend: true, format: 'esm' }],
  plugins: [
    commonjsPlugin(),
    jsonPlugin(),
    nodeResolve(),
    typescript,
    copyPlugin({
      targets: [{ src: 'src/prompts/*.md', dest: 'dist/prompts' }],
    }),
  ],
};

const buildTypes: RollupOptions = {
  input: 'src/index.ts',
  output: [{ file: 'dist/index.d.ts', format: 'esm' }],
  plugins: [dtsPlugin()],
};

const buildCli: RollupOptions = {
  input: 'src/cli.ts',
  external: [
    'commander',
    'croner',
    'fastify',
    'handlebars',
    'pino',
    'pino/file',
    'zod',
    'tslib',
    'node:fs',
    'node:path',
    'node:process',
    'node:url',
  ],
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
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      noEmit: false,
      declaration: false,
      incremental: false,
    }),
    copyPlugin({
      targets: [
        { src: 'src/prompts/*.md', dest: 'dist/cli/jeeves-meta' },
      ],
    }),
  ],
};

export default [buildLibrary, buildTypes, buildCli];
