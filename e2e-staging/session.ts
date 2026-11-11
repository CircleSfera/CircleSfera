import {
  type APIResponse,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from '@playwright/test';

/** The environment's Test Accounts (ops-environment-test-account.yml). */
export const HOST = 'qa_host';
export const VIEWER = 'qa_viewer';

export interface Session {
  context: BrowserContext;
  page: Page;
  get(path: string): Promise<APIResponse>;
  post(path: string, data?: unknown): Promise<APIResponse>;
  delete(path: string): Promise<APIResponse>;
  upload(path: string, file: string, mimeType: string): Promise<APIResponse>;
}

const cookieConsent = JSON.stringify({
  necessary: true,
  analytics: false,
  updatedAt: new Date().toISOString(),
});

/** Signs a Test Account in through the sign-in form, as a person does. */
/** A phone's screen, as the app is designed for first. */
export const PHONE = { width: 390, height: 844 };

export async function signIn(
  browser: Browser,
  username: string,
  options: { phone?: boolean } = {},
): Promise<Session> {
  const password = process.env.STAGING_TEST_ACCOUNT_PASSWORD;
  if (!password) throw new Error('STAGING_TEST_ACCOUNT_PASSWORD is not set');
  const context = await browser.newContext(
    options.phone
      ? { viewport: PHONE, permissions: ['camera', 'microphone'] }
      : {},
  );
  const page = await context.newPage();
  await page.addInitScript((consent: string) => {
    localStorage.setItem('cs_cookie_consent', consent);
  }, cookieConsent);
  await page.goto('/accounts/login');
  await page.locator('#identifier').fill(username);
  await page.locator('#password').fill(password);
  // The environment uses the provider's test keys: the check passes alone.
  await page.waitForFunction(
    () =>
      (
        document.querySelector(
          'input[name="cf-turnstile-response"]',
        ) as HTMLInputElement | null
      )?.value,
  );
  await page.getByTestId('login-submit-button').click();
  await expect(page).not.toHaveURL(/\/accounts\/login/);

  // While a deploy restarts the backend the proxy answers with a page, not
  // the token: asked again for up to a minute.
  const csrf = async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await page.request.get('/api/v1/csrf-token');
      if (res.ok() && /json/.test(res.headers()['content-type'] ?? '')) {
        return ((await res.json()) as { csrfToken: string }).csrfToken;
      }
      if (attempt >= 12) {
        throw new Error(`No CSRF token from staging (${res.status()})`);
      }
      await page.waitForTimeout(5_000);
    }
  };
  // A Test Account that never went through onboarding is sent to it after
  // each sign-in: it is marked done, as finishing it does, before any check.
  const done = await page.request.put('/api/v1/users/me/settings', {
    headers: { 'x-csrf-token': await csrf() },
    data: { isOnboarded: true },
  });
  expect(done.ok(), await done.text()).toBe(true);
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/(onboarding|accounts\/login)/);
  return {
    context,
    page,
    get: (path) => page.request.get(`/api/v1${path}`),
    post: async (path, data) =>
      page.request.post(`/api/v1${path}`, {
        headers: { 'x-csrf-token': await csrf() },
        data: data ?? {},
      }),
    delete: async (path) =>
      page.request.delete(`/api/v1${path}`, {
        headers: { 'x-csrf-token': await csrf() },
      }),
    upload: async (path, file, mimeType) => {
      const { readFile } = await import('node:fs/promises');
      const { basename } = await import('node:path');
      return page.request.post(`/api/v1${path}`, {
        headers: { 'x-csrf-token': await csrf() },
        multipart: {
          file: {
            name: basename(file),
            mimeType,
            buffer: await readFile(file),
          },
        },
      });
    },
  };
}
