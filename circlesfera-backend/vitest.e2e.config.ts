import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Transformation is handled by unplugin-swc (decorator metadata); Vite's
  // built-in Oxc transform must be disabled explicitly since Vite 7.
  oxc: false,
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    testTimeout: 30000,
    setupFiles: ['./test/setup.e2e.ts'],
    // Every spec boots its own AppModule against the same Postgres/Redis
    // instance, so run the files one at a time: it keeps cross-spec writes out
    // of each other's way and keeps the interleaved request logs readable.
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        keepClassNames: true,
        target: 'es2022',
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
});
