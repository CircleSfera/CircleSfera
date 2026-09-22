import type { Page } from '@playwright/test';

export const TEST_USER = {
  id: 'user1',
  username: 'tester',
  displayName: 'Tester',
  email: 'test@example.com',
} as const;

export interface ScenarioUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  role: string;
  accountType: TestAccountType;
}

/**
 * Generates an isolated mock user identity per test scenario.
 * Prevents race conditions and state leakage across parallel browser contexts.
 */
export function createScenarioUser(
  options: {
    scenario?: string;
    role?: string;
    accountType?: TestAccountType;
    id?: string;
    username?: string;
    displayName?: string;
    email?: string;
  } = {},
): ScenarioUser {
  const accountType = options.accountType ?? 'PERSONAL';
  const rawScenario = (options.scenario || 'test')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const prefix = rawScenario.slice(0, 8);
  const pid = typeof process !== 'undefined' ? process.pid.toString(36) : 'p';
  const rand = Math.random().toString(36).slice(2, 6);
  const suffix = `${pid}${rand}`;
  const username = options.username ?? `${prefix}_${suffix}`.slice(0, 20);
  const id = options.id ?? `usr_${prefix}_${suffix}`;

  return {
    id,
    username,
    displayName:
      options.displayName ??
      `${options.scenario ? options.scenario.charAt(0).toUpperCase() + options.scenario.slice(1) : 'Scenario'} User`,
    email: options.email ?? `${username}@example.test`,
    role: options.role ?? 'user',
    accountType,
  };
}

export const emptyPage = {
  data: [] as unknown[],
  meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
};

export type TestAccountType = 'PERSONAL' | 'CREATOR' | 'BUSINESS';

const now = () => new Date().toISOString();

/** Profile payload matching `ProfileWithUser` as the SPA reads it. */
export function testProfile(
  overrides: Record<string, unknown> = {},
  user?: ScenarioUser,
): Record<string, unknown> {
  const base = user ?? {
    id: (overrides.userId as string) ?? TEST_USER.id,
    username: (overrides.username as string) ?? TEST_USER.username,
    displayName: (overrides.fullName as string) ?? TEST_USER.displayName,
    email: (overrides.email as string) ?? TEST_USER.email,
    role: (overrides.role as string) ?? 'user',
    accountType: (overrides.accountType as TestAccountType) ?? 'PERSONAL',
  };
  const accountType =
    (overrides.accountType as TestAccountType | undefined) ?? base.accountType;
  return {
    id: base.id,
    userId: base.id,
    username: base.username,
    fullName: base.displayName,
    email: base.email,
    bio: null,
    avatar: null,
    avatarUrl: null,
    standardUrl: null,
    thumbnailUrl: null,
    website: null,
    location: null,
    role: base.role,
    accountType,
    emailConfirmed: true,
    createdAt: now(),
    updatedAt: now(),
    user: {
      id: base.id,
      email: base.email,
      role: base.role,
      accountType,
      createdAt: now(),
      _count: { posts: 0, followers: 0, following: 0 },
    },
    ...overrides,
  };
}

export function testPost(
  overrides: Record<string, unknown> = {},
  user?: ScenarioUser,
): Record<string, unknown> {
  const base = user ?? TEST_USER;
  const profileId = (overrides.profileId as string) ?? base.id;
  const username = (overrides.username as string) ?? base.username;
  const displayName =
    'displayName' in base
      ? base.displayName
      : ((overrides.fullName as string) ?? 'Tester');

  return {
    id: 'post-1',
    type: 'POST',
    profileId,
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
      id: profileId,
      userId: profileId,
      username,
      fullName: displayName,
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

function authStoragePayload(
  accountType: TestAccountType,
  user?: ScenarioUser,
): string {
  const profile = testProfile({ accountType }, user);
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
  options: {
    accountType?: TestAccountType;
    scenario?: string;
    user?: ScenarioUser;
  } = {},
): Promise<{ user: ScenarioUser; profile: Record<string, unknown> }> {
  const accountType = options.accountType ?? 'PERSONAL';
  const user: ScenarioUser =
    options.user ??
    (options.scenario
      ? createScenarioUser({ scenario: options.scenario, accountType })
      : {
          id: TEST_USER.id,
          username: TEST_USER.username,
          displayName: TEST_USER.displayName,
          email: TEST_USER.email,
          role: 'user',
          accountType,
        });
  const meProfile = testProfile({ accountType }, user);

  await stubSpaApi(page);

  await page.route('**/api/v1/profiles/me', async (route) => {
    await route.fulfill({ status: 200, json: meProfile });
  });

  await page.route('**/api/v1/users/me', async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        id: user.id,
        email: user.email,
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

  await injectLocaleAndConsent(page, authStoragePayload(accountType, user));
  return { user, profile: meProfile };
}
