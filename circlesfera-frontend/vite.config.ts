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
              name: 'vendor-viz',
              test: /[\\/]node_modules[\\/](recharts|html-to-image)[\\/]/,
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
      // lowered, until the 80% global target is met.
      thresholds: {
        statements: 31,
        lines: 32,
        branches: 31,
        functions: 28,
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
        'src/stores/authStore.ts': { statements: 95, lines: 95 },
        'src/stores/adminAuthStore.ts': { statements: 95, lines: 95 },
        'src/pages/Onboarding.tsx': { statements: 80, lines: 80 },
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
        'src/utils/format.ts': { statements: 100, lines: 100 },
        'src/hooks/useCreatePostMutation.ts': { statements: 85, lines: 85 },
        'src/components/admin/ReportsTab.tsx': { statements: 55, lines: 55 },
        'src/pages/Profile.tsx': { statements: 60, lines: 60 },
        'src/components/chat/ConversationList.tsx': {
          statements: 85,
          lines: 85,
        },
        'src/components/chat/ChatWindow.tsx': { statements: 94, lines: 98 },
      },
    },
  },
});
