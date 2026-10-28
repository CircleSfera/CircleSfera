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
  upload(path: string, file: string, mimeType: string): Promise<APIResponse>;
}

const cookieConsent = JSON.stringify({
  necessary: true,
  analytics: false,
  updatedAt: new Date().toISOString(),
});

/** Signs a Test Account in through the sign-in form, as a person does. */
export async function signIn(
  browser: Browser,
  username: string,
): Promise<Session> {
  const password = process.env.STAGING_TEST_ACCOUNT_PASSWORD;
  if (!password) throw new Error('STAGING_TEST_ACCOUNT_PASSWORD is not set');
  const context = await browser.newContext();
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

  const csrf = async () => {
    const res = await page.request.get('/api/v1/csrf-token');
    return ((await res.json()) as { csrfToken: string }).csrfToken;
  };
  return {
    context,
    page,
    get: (path) => page.request.get(`/api/v1${path}`),
    post: async (path, data) =>
      page.request.post(`/api/v1${path}`, {
        headers: { 'x-csrf-token': await csrf() },
        data: data ?? {},
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
