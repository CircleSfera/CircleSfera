import type { Page } from '@playwright/test';

export const TEST_USER = {
  id: 'user1',
  username: 'tester',
  displayName: 'Tester',
  email: 'test@example.com',
} as const;

export const emptyPage = {
  data: [] as unknown[],
  meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
};

export type TestAccountType = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

const now = () => new Date().toISOString();

/** Profile payload matching `ProfileWithUser` as the SPA reads it. */
export function testProfile(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const accountType =
    (overrides.accountType as TestAccountType | undefined) ?? 'PERSONAL';
  return {
    id: TEST_USER.id,
    userId: TEST_USER.id,
    username: TEST_USER.username,
    fullName: TEST_USER.displayName,
    email: TEST_USER.email,
    bio: null,
    avatar: null,
    avatarUrl: null,
    standardUrl: null,
    thumbnailUrl: null,
    website: null,
    location: null,
    role: 'user',
    accountType,
    emailConfirmed: true,
    createdAt: now(),
    updatedAt: now(),
    user: {
      id: TEST_USER.id,
      email: TEST_USER.email,
      role: 'user',
      accountType,
      createdAt: now(),
      _count: { posts: 0, followers: 0, following: 0 },
    },
    ...overrides,
  };
}

export function testPost(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'post-1',
    type: 'POST',
    profileId: TEST_USER.id,
    caption: null,
    createdAt: now(),
    updatedAt: now(),
    media: [
      {
        id: 'media-1',
        url: 'https://cdn.example.com/uploads/test.jpg',
        type: 'image',
        order: 0,
      },
    ],
    profile: {
      id: TEST_USER.id,
      userId: TEST_USER.id,
      username: TEST_USER.username,
      fullName: TEST_USER.displayName,
      bio: null,
      avatar: null,
      standardUrl: null,
      thumbnailUrl: null,
      website: null,
      createdAt: now(),
      updatedAt: now(),
    },
    _count: { likes: 0, comments: 0 },
    likesCount: 0,
    commentsCount: 0,
    ...overrides,
  };
}

function authStoragePayload(accountType: TestAccountType): string {
  const profile = testProfile({ accountType });
  return JSON.stringify({
    state: {
      isAuthenticated: true,
      profile,
    },
    version: 0,
  });
}

const cookieConsent = JSON.stringify({
  necessary: true,
  analytics: false,
  updatedAt: new Date().toISOString(),
});

async function injectLocaleAndConsent(
  page: Page,
  auth?: string,
): Promise<void> {
  await page.addInitScript(
    (payload) => {
      localStorage.setItem('cs_cookie_consent', payload.cookies);
      localStorage.setItem('i18nextLng', 'es');
      if (payload.auth) {
        localStorage.setItem('auth-storage', payload.auth);
      }
    },
    { cookies: cookieConsent, auth: auth ?? null },
  );
}

/**
 * Network isolation for SPA Playwright. Last registered `page.route` wins —
 * specs must register extra handlers *after* this.
 */
export async function stubSpaApi(page: Page): Promise<void> {
  await page.route('**/csrf-token', async (route) => {
    await route.fulfill({
      status: 200,
      json: { csrfToken: 'e2e-csrf' },
    });
  });

  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes('csrf-token')) {
      await route.fulfill({
        status: 200,
        json: { csrfToken: 'e2e-csrf' },
      });
      return;
    }

    if (method === 'GET' && /\/(feed|posts|notifications)(\/|\?|$)/.test(url)) {
      await route.fulfill({ status: 200, json: emptyPage });
      return;
    }

    if (
      method === 'GET' &&
      (url.includes('/users/suggestions') ||
        url.includes('/search/history') ||
        url.includes('/payments/plans') ||
        url.includes('/highlights') ||
        url.includes('/creator/activity-chart') ||
        url.includes('/close-friends') ||
        url.includes('/live/active') ||
        url.includes('/stories') ||
        url.includes('/chat/conversations'))
    ) {
      await route.fulfill({ status: 200, json: [] });
      return;
    }

    if (url.includes('/unread')) {
      await route.fulfill({ status: 200, json: { count: 0 } });
      return;
    }

    await route.fulfill({ status: 200, json: {} });
  });
}

/** Guest chrome: locale es + cookie banner dismissed. No auth. */
export async function prepareGuestSession(page: Page): Promise<void> {
  await stubSpaApi(page);
  await injectLocaleAndConsent(page);
}

/**
 * Auth storage + es locale + API catch-all so SPA routes work without a backend.
 * Stubs network only. Register extra `page.route` handlers *after* this (last wins).
 */
export async function prepareAuthenticatedSession(
  page: Page,
  options: { accountType?: TestAccountType } = {},
): Promise<void> {
  const accountType = options.accountType ?? 'PERSONAL';
  const meProfile = testProfile({ accountType });

  await stubSpaApi(page);

  await page.route('**/api/v1/profiles/me', async (route) => {
    await route.fulfill({ status: 200, json: meProfile });
  });

  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: TEST_USER.id,
        email: TEST_USER.email,
        profile: meProfile,
      },
    });
  });

  await page.route('**/api/v1/system/config', async (route) => {
    await route.fulfill({
      status: 200,
      json: { turnstileSiteKey: '1x00000000000000000000AA' },
    });
  });

  await page.route('**/api/v1/notifications**', async (route) => {
    await route.fulfill({ status: 200, json: emptyPage });
  });

  await page.route('**/api/v1/stories**', async (route) => {
    await route.fulfill({ status: 200, json: [] });
  });

  await page.route('**/api/v1/payments/plans', async (route) => {
    await route.fulfill({ status: 200, json: [] });
  });

  await injectLocaleAndConsent(page, authStoragePayload(accountType));
}
