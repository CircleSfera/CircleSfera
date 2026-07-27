import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Transformation is handled by unplugin-swc (decorator metadata); Vite's
  // built-in Oxc transform must be disabled explicitly since Vite 7.
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'test/'],
      // Modest floor — test:cov is not in PR CI; raise gradually.
      thresholds: {
        statements: 30,
        lines: 30,
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
