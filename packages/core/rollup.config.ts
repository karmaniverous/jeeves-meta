import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescriptPlugin from '@rollup/plugin-typescript';
import type { RollupOptions } from 'rollup';

const onwarn: RollupOptions['onwarn'] = (warning, warn) => {
  if (warning.code === 'CIRCULAR_DEPENDENCY') return;
  warn(warning);
};

const buildLibrary: RollupOptions = {
  input: 'src/index.ts',
  external: ['zod', 'tslib', /^node:/],
  onwarn,
  output: [{ dir: 'dist', format: 'esm' }],
  plugins: [
    commonjs(),
    nodeResolve({ extensions: ['.ts', '.js'] }),
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
