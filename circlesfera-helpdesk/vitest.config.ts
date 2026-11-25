import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Transformation is handled by unplugin-swc (decorator metadata); Vite's
  // built-in Oxc transform must be disabled explicitly since Vite 7.
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Every source file counts, read by a test or not.
      include: ['src/**/*.ts'],
      // The entry point, type-only files and the tests themselves.
      exclude: ['src/main.ts', '**/*.d.ts', '**/*.spec.ts'],
      // A ratchet, as in circlesfera-backend: set to the measured coverage
      // and only ever raised, never lowered.
      thresholds: {
        statements: 100,
        lines: 100,
        branches: 100,
        functions: 100,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
