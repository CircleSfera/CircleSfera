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
      // Risk-based coverage threshold policy:
      // Global baseline floor plus explicit thresholds for critical paths
      // (Security, Authorization, Payments, Monetization, and Data Lifecycle).
      thresholds: {
        // Global baseline across all backend code
        statements: 45,
        lines: 45,

        // Security & Authentication: auth services, 2FA, passkeys, credential lifecycle
        'src/auth/**': {
          statements: 65,
          lines: 65,
        },

        // Authorization: Admin RBAC access control
        'src/auth/guards/admin.guard.ts': {
          statements: 90,
          lines: 90,
        },

        // Authorization: Horizontal resource ownership validation
        'src/auth/guards/ownership.guard.ts': {
          statements: 75,
          lines: 75,
        },

        // Payments: Stripe integration, checkout sessions, invoices, and billing
        'src/payments/**': {
          statements: 45,
          lines: 45,
        },

        // Monetization: Creator payouts, tips, and fee calculations
        'src/monetization/**': {
          statements: 30,
          lines: 30,
        },

        // Data Lifecycle: GDPR personal data extraction service
        'src/users/services/data-export.service.ts': {
          statements: 85,
          lines: 85,
        },

        // Data Lifecycle: Permanent user deletion and purgatory purge processor
        'src/users/processors/user-deletion.processor.ts': {
          statements: 60,
          lines: 60,
        },

        // Reliability: Transactional outbox event dispatch and delivery guarantees
        'src/outbox/**': {
          statements: 80,
          lines: 80,
        },
      },
    },
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});
