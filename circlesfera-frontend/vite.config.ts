import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import { copyStudioMediaAssets } from './vite.studio-assets.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    copyStudioMediaAssets(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      registerType: 'autoUpdate',
      manifest: {
        name: 'CircleSfera',
        short_name: 'CircleSfera',
        description: 'Immersive Social Experience',
        start_url: '/',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Keep FFmpeg wasm out of the SW precache (large binary)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        globIgnores: ['**/ffmpeg/**', '**/fonts/Roboto-*.ttf'],
      },
      injectManifest: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Admin Panel e2e / local: http://admin.localhost:5173
    host: true,
    allowedHosts: true,
    proxy: {
      '/api/v1': {
        // In Docker Compose the backend service is reachable as http://backend:3000.
        // Local host runs use the published port http://localhost:3000.
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Vite 8 bundles with Rolldown: the same vendor chunks as before, as
    // code splitting groups (manualChunks objects are no longer accepted).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router-dom|react-router|scheduler)[\\/]/,
            },
            {
              name: 'vendor-ui',
              test: /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils|lucide-react)[\\/]/,
            },
            {
              name: 'vendor-utils',
              test: /[\\/]node_modules[\\/](axios|@tanstack[\\/]react-query|@tanstack[\\/]query-core|zustand|clsx)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Dates are written in the zone of the machine. The tests read fixed
    // dates, so they run in one zone wherever they run.
    env: { TZ: 'UTC' },
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      // Standard exclusions: the tests and their helpers, the entry point,
      // the service worker and type-only files.
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/service-worker.ts',
        'src/**/*.d.ts',
        'src/types/**',
      ],
      // Ratchet: set to the measured coverage and only ever raised, never
      // lowered. The 80% global target is met on every measure.
      thresholds: {
        statements: 88,
        lines: 89,
        branches: 81,
        functions: 85,
        // Critical paths: the API client (session renewal, CSRF), the
        // session guards and passkeys, the sign-in and account recovery
        // pages, creator payouts and appeal review.
        'src/services/api.ts': { statements: 100, lines: 100 },
        'src/pages/ForgotPassword.tsx': { statements: 100, lines: 100 },
        'src/pages/ResetPassword.tsx': { statements: 100, lines: 100 },
        'src/pages/Login.tsx': { statements: 100, lines: 100 },
        'src/pages/AdminPanelLogin.tsx': { statements: 100, lines: 100 },
        'src/components/monetization/ConnectStripeButton.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/settings/MonetizationSettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/admin/AppealsTab.tsx': { statements: 100, lines: 100 },
        'src/utils/money.ts': { statements: 100, lines: 100 },
        'src/components/auth/AuthGuard.tsx': { statements: 100, lines: 100 },
        'src/components/auth/GuestGuard.tsx': { statements: 100, lines: 100 },
        'src/services/passkey.service.ts': { statements: 100, lines: 100 },
        'src/stores/authStore.ts': { statements: 97, lines: 97 },
        'src/stores/adminAuthStore.ts': { statements: 96, lines: 95 },
        'src/pages/Onboarding.tsx': { statements: 84, lines: 85 },
        'src/pages/Settings.tsx': { statements: 95, lines: 95 },
        'src/services/monetization.service.ts': {
          statements: 100,
          lines: 100,
        },
        'src/components/monetization/PaywallOverlay.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/monetization/MonetizationDashboard.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/monetization/TipModal.tsx': {
          statements: 95,
          lines: 100,
        },
        'src/components/live/LiveGiftModal.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/create-post/MonetizationSubScreen.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/creator/CreatorMoneyTab.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/creator/CreatorMonetizationTab.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/pages/payments/Pricing.tsx': { statements: 100, lines: 100 },
        'src/utils/apiErrorMessage.ts': { statements: 100, lines: 100 },
        'src/utils/planFeatures.ts': { statements: 100, lines: 100 },
        'src/utils/identityVerification.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/utils/format.ts': { statements: 100, lines: 100 },
        'src/hooks/useCreatePostMutation.ts': { statements: 89, lines: 89 },
        'src/components/admin/ReportsTab.tsx': { statements: 98, lines: 98 },
        'src/pages/Profile.tsx': { statements: 88, lines: 89 },
        'src/components/chat/ConversationList.tsx': {
          statements: 88,
          lines: 90,
        },
        'src/components/chat/ChatWindow.tsx': { statements: 94, lines: 98 },
        // Sign-in, sessions and the second factor.
        'src/services/auth.service.ts': { statements: 100, lines: 100 },
        'src/services/admin-auth.service.ts': { statements: 100, lines: 100 },
        'src/utils/signInErrors.ts': { statements: 100, lines: 100 },
        'src/components/TwoFactorSettings.tsx': { statements: 100, lines: 100 },
        'src/components/settings/ActiveSessionsSettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/auth/AdminGuard.tsx': { statements: 100, lines: 100 },
        'src/components/auth/AppLockScreen.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/auth/EmailVerificationBanner.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/auth/TurnstileWidget.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/stores/securityStore.ts': { statements: 100, lines: 100 },
        // Money: what is charged and what is paid out.
        'src/services/payments.service.ts': { statements: 100, lines: 100 },
        'src/constants/monetization.ts': { statements: 100, lines: 100 },
        'src/components/admin/MonetizationTab.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/admin/PayoutsTab.tsx': { statements: 100, lines: 100 },
        // Registration, the sign-ins of a Profile, passkeys and the creator guard.
        'src/pages/Register.tsx': { statements: 100, lines: 100 },
        'src/services/signIns.service.ts': { statements: 100, lines: 100 },
        'src/components/profiles/ProfileSignIns.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/settings/PasskeySettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/auth/CreatorStudioGuard.tsx': {
          statements: 100,
          lines: 100,
        },
        // Privacy, a person's own data and appeals.
        'src/components/settings/AccountSettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/CookieConsent.tsx': { statements: 100, lines: 100 },
        'src/utils/cookieConsent.ts': { statements: 100, lines: 100 },
        'src/components/settings/AppealsSettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/settings/PrivacySettings.tsx': {
          statements: 100,
          lines: 100,
        },
        'src/components/modals/BlockModal.tsx': { statements: 100, lines: 100 },
        'src/services/data-export.service.ts': { statements: 100, lines: 100 },
        'src/services/appeals.service.ts': { statements: 100, lines: 100 },
      },
    },
  },
});
