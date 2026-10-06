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
      // Standard exclusions (QD-007): the entry point, type-only files,
      // configuration, generated code and the tests themselves.
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        'prisma/',
        'src/main.ts',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        'src/common/testing/**',
      ],
      // Risk-based coverage threshold policy: a global floor plus
      // explicit thresholds for critical paths. Thresholds are a ratchet: set
      // to the measured coverage and only ever raised, never lowered.
      thresholds: {
        // Global floor across all backend code (target 80%, met).
        statements: 86,
        lines: 86,
        branches: 78,
        functions: 86,

        // Security & Authentication: auth services, 2FA, passkeys, credential lifecycle
        'src/auth/**': {
          statements: 95,
          lines: 95,
        },

        // Authorization guards (target 100%)
        'src/auth/guards/**': {
          statements: 100,
          lines: 100,
        },

        // Authorization: Admin RBAC access control (100% fully covered)
        'src/auth/guards/admin.guard.ts': {
          statements: 100,
          lines: 100,
        },

        // Authorization: Horizontal resource ownership validation (100% fully covered)
        'src/auth/guards/ownership.guard.ts': {
          statements: 100,
          lines: 100,
        },

        // Security: Two-factor authentication service and controller (100% fully covered)
        'src/auth/two-factor/two-factor.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/auth/two-factor/two-factor.controller.ts': {
          statements: 100,
          lines: 100,
        },

        // Payments: Stripe webhook secret security validation (100% fully covered)
        'src/common/stripe/stripe-webhook-secrets.ts': {
          statements: 100,
          lines: 100,
        },

        // Data Lifecycle: Hard deletion domain event definition (100% fully covered)
        'src/users/events/user-hard-deleted.event.ts': {
          statements: 100,
          lines: 100,
        },

        // Payments: Stripe integration, checkout sessions, invoices, and billing
        'src/payments/**': {
          statements: 99,
          lines: 99,
        },

        // Monetization: Creator payouts, tips, and fee calculations
        'src/monetization/**': {
          statements: 100,
          lines: 100,
        },

        // Data Lifecycle: GDPR personal data export and account deletion
        'src/users/data-export.service.ts': {
          statements: 96,
          lines: 97,
        },
        'src/users/data-export.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/users/account-deletion.processor.ts': {
          statements: 100,
          lines: 100,
        },

        // Moderation: warnings, strikes, appeals, reports, spam detection
        'src/strikes/**': {
          statements: 93,
          lines: 94,
        },
        'src/appeals/**': {
          statements: 100,
          lines: 100,
        },
        'src/reports/**': {
          statements: 100,
          lines: 100,
        },
        'src/trust/**': {
          statements: 90,
          lines: 91,
        },
        'src/admin/admin-risk-cases.*': {
          statements: 100,
          lines: 100,
        },
        'src/admin/use-cases/content/commands/review-report.use-case.ts': {
          statements: 100,
          lines: 100,
        },

        // Security: abuse protection (Turnstile, device signals) and policies
        'src/common/abuse/**': {
          statements: 99,
          lines: 99,
        },
        'src/common/policies/**': {
          statements: 98,
          lines: 100,
        },
        'src/security-reports/**': {
          statements: 100,
          lines: 100,
        },

        // Data Lifecycle: retention jobs
        'src/maintenance/**': {
          statements: 100,
          lines: 100,
        },

        // Reliability: Transactional outbox event dispatch and delivery guarantees
        'src/outbox/**': {
          statements: 100,
          lines: 100,
        },

        // Core and lightweight services elevated to full coverage
        'src/app.controller.ts': { statements: 100, lines: 100 },
        'src/audio/audio.service.ts': { statements: 100, lines: 100 },
        'src/bookmarks/bookmarks.service.ts': { statements: 100, lines: 100 },
        'src/collections/collections.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/comments/comments.service.ts': { statements: 100, lines: 100 },
        'src/email/email.service.ts': { statements: 100, lines: 100 },
        'src/email/email-templates.ts': { statements: 100, lines: 100 },
        'src/follows/follows.service.ts': { statements: 100, lines: 100 },
        'src/health/health.controller.ts': { statements: 100, lines: 100 },
        'src/highlights/highlights.service.ts': { statements: 100, lines: 100 },
        'src/likes/likes.service.ts': { statements: 100, lines: 100 },
        'src/places/places.service.ts': { statements: 98, lines: 100 },
        'src/prisma/prisma.service.ts': { statements: 100, lines: 100 },
        'src/profiles/profiles.service.ts': { statements: 98, lines: 100 },
        'src/push/push.service.ts': { statements: 100, lines: 100 },
        'src/reports/reports.service.ts': { statements: 100, lines: 100 },
        'src/seo/seo.service.ts': { statements: 100, lines: 100 },
        'src/support/support.service.ts': { statements: 100, lines: 100 },
        'src/system-settings/system-settings.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/warehouse/warehouse-export.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/warehouse/clickhouse-load.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/warehouse/processors/warehouse-export.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/warehouse/utils/csv.util.ts': { statements: 100, lines: 100 },
        'src/webrtc/webrtc.service.ts': { statements: 100, lines: 100 },
        'src/whitelist/whitelist.service.ts': { statements: 100, lines: 100 },

        // Social, media, feed, content, and uploads modules elevated to full coverage
        'src/close-friends/close-friends.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/close-friends/close-friends.controller.ts': {
          statements: 100,
          lines: 100,
        },
        'src/media/media-auth.service.ts': { statements: 100, lines: 100 },
        'src/media/media.controller.ts': { statements: 100, lines: 100 },
        'src/interactive/interactive.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/edits/edits.service.ts': { statements: 100, lines: 100 },
        'src/edits/edits.controller.ts': { statements: 100, lines: 100 },
        'src/edits/processors/edits.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/stories/stories.service.ts': { statements: 100, lines: 100 },
        'src/stories/stories.controller.ts': { statements: 100, lines: 100 },
        'src/stories/processors/stories.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/search/search.service.ts': { statements: 100, lines: 100 },
        'src/search/search.controller.ts': { statements: 100, lines: 100 },
        'src/feed/feed.service.ts': { statements: 97, lines: 100 },
        'src/feed/feed.controller.ts': { statements: 100, lines: 100 },
        'src/feed/feed-inbox.service.ts': { statements: 100, lines: 100 },
        'src/feed/feed-preferences.service.ts': { statements: 100, lines: 100 },
        'src/feed/feed-preferences.controller.ts': {
          statements: 100,
          lines: 100,
        },
        'src/feed/processors/feed-fanout.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/posts/posts.service.ts': { statements: 100, lines: 100 },
        'src/posts/posts.controller.ts': { statements: 100, lines: 100 },
        'src/posts/posts.processor.ts': { statements: 100, lines: 100 },
        'src/posts/services/post-distribution.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/posts/services/post-media-cleanup.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/posts/services/post-paywall.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/uploads.service.ts': { statements: 100, lines: 100 },
        'src/uploads/uploads.controller.ts': { statements: 100, lines: 100 },
        'src/uploads/media-processor.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/media-signature.validator.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/mime-to-ext.ts': { statements: 100, lines: 100 },
        'src/uploads/processors/media-cleanup.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/processors/video.processor.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/providers/cloudinary.provider.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/providers/local.provider.ts': {
          statements: 100,
          lines: 100,
        },
        'src/uploads/providers/s3.provider.ts': { statements: 98, lines: 100 },
        'src/uploads/services/media-reconciliation.service.ts': {
          statements: 100,
          lines: 100,
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
