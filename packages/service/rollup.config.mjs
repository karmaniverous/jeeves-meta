import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import copyPlugin from 'rollup-plugin-copy';
import dtsPlugin from 'rollup-plugin-dts';

function onwarn(warning, warn) {
  if (warning?.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
}

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

const external = [
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

const buildLibrary = {
  input: 'src/index.ts',
  external,
  onwarn,
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

const buildTypes = {
  input: 'src/index.ts',
  external: [/^node:/],
  onwarn,
  output: [{ file: 'dist/index.d.ts', format: 'esm' }],
  plugins: [dtsPlugin()],
};

const buildCli = {
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
      include: ['src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      noEmit: false,
      declaration: false,
      incremental: false,
    }),
    copyPlugin({
      targets: [{ src: 'src/prompts/*.md', dest: 'dist/cli/jeeves-meta' }],
    }),
  ],
};

export default [buildLibrary, buildTypes, buildCli];
