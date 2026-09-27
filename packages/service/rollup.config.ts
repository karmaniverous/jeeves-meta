import { readFileSync } from 'node:fs';

import commonjsPlugin from '@rollup/plugin-commonjs';
import jsonPlugin from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { Plugin, RollupOptions } from 'rollup';
import copyPlugin from 'rollup-plugin-copy';

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const PROMPT_FILES = ['architect.md', 'critic.md'];

/**
 * Build-time assertion: the published bundle reads its built-in prompts from
 * `dist/prompts`, so fail the build if the copy is missing or stale.
 */
const verifyPrompts = (): Plugin => ({
  name: 'verify-prompts',
  writeBundle() {
    for (const file of PROMPT_FILES) {
      const built = readFileSync(`dist/prompts/${file}`, 'utf8');
      if (built !== readFileSync(`src/prompts/${file}`, 'utf8')) {
        this.error(`dist/prompts/${file} does not match src/prompts/${file}`);
      }
    }
  },
});

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
      // Type against the built core package, not the source path mapping
      // used by typecheck/tests (see tsconfig.json).
      paths: {},
    }),
    // The bundled prompt loader (src/prompts/index.ts) reads `<package root>/dist/prompts`.
    copyPlugin({
      targets: [{ src: 'src/prompts/*.md', dest: 'dist/prompts' }],
    }),
    verifyPrompts(),
  ],
};

export default [buildCli];
