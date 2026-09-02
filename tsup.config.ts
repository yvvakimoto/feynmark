import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    target: 'es2020',
  },
  {
    entry: { 'feynmark.min': 'src/standalone.ts' },
    format: ['iife'],
    globalName: 'feynmark',
    minify: true,
    sourcemap: true,
    target: 'es2020',
    outExtension: () => ({ js: '.js' }),
  },
]);
