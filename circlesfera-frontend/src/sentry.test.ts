import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  reactRouterV6BrowserTracingIntegration: vi.fn(() => ({})),
  replayIntegration: vi.fn(() => ({})),
}));
vi.mock('./utils/cookieConsent', () => ({
  getCookieConsent: () => ({ analytics: true }),
}));
vi.mock('./utils/sentryHost', () => ({ isOwnHost: () => true }));

describe('initSentry', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.mocked(Sentry.init).mockClear();
  });

  it('names the commit the app was built from as the release', async () => {
    vi.stubEnv('VITE_SENTRY_RELEASE', 'abc123');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ release: 'abc123' }),
    );
  });

  it('names no release when the build had none', async () => {
    vi.stubEnv('VITE_SENTRY_RELEASE', '');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(vi.mocked(Sentry.init).mock.calls[0][0]).toMatchObject({
      release: undefined,
    });
  });
});
