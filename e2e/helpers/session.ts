import path from 'node:path';
import {
  type APIRequestContext,
  expect,
  type Page,
  request,
} from '@playwright/test';
import { backendApiUrl, markEmailVerified } from './backend.js';
import {
  createScenarioAccount,
  type E2eAccount,
  uniqueAccount,
} from './factories.js';

/** Visible Post still (same fixture as SPA composer e2e — not a solid colour). */
export const POST_IMAGE = path.resolve(
  'circlesfera-frontend',
  'e2e',
  'fixtures',
  'post-4x5.jpg',
);

const cookieConsent = JSON.stringify({
  necessary: true,
  analytics: false,
  updatedAt: new Date().toISOString(),
});

/** Locale es + cookie banner dismissed. No Nest stub. */
export async function prepareGuest(page: Page): Promise<void> {
  await page.addInitScript((payload: string) => {
    localStorage.setItem('cs_cookie_consent', payload);
    localStorage.setItem('i18nextLng', 'es');
  }, cookieConsent);
}

export async function registerViaApi(
  request: APIRequestContext,
  account: E2eAccount,
): Promise<void> {
  const res = await request.post(`${backendApiUrl()}/auth/register`, {
    data: {
      email: account.email,
      username: account.username,
      password: account.password,
      fullName: account.fullName,
      dateOfBirth: account.dateOfBirth,
    },
  });
  if (res.status() !== 201) {
    throw new Error(
      `register failed: ${res.status()} ${await res.text()}`.slice(0, 400),
    );
  }
}

export async function loginViaUi(
  page: Page,
  account: Pick<E2eAccount, 'email' | 'password'>,
): Promise<void> {
  await page.goto('/accounts/login');
  await page.locator('#identifier').fill(account.email);
  await page.locator('#password').fill(account.password);
  await page.getByTestId('login-submit-button').click();
  await expect(page).not.toHaveURL(/\/accounts\/login/, { timeout: 20_000 });
}

export async function completeOnboarding(page: Page): Promise<void> {
  // API register does not create UserSettings, so AuthGuard may not
  // send UI-login users to /onboarding. Open the product flow explicitly.
  if (!/\/onboarding/.test(page.url())) {
    await page.goto('/onboarding');
  }
  await expect(page.getByTestId('onboarding-continue')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId('onboarding-continue').click();
  await expect(page.getByTestId('onboarding-enter')).toBeVisible();
  await page.getByTestId('onboarding-enter').click();
  await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 20_000 });
}

export async function becomeCreator(page: Page): Promise<void> {
  await page.goto('/accounts/profile');
  await expect(page.locator('#username')).not.toHaveValue('');
  await page.getByRole('button', { name: /Para artistas/ }).click();
  const save = page.getByRole('button', { name: 'Guardar Cambios del Perfil' });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText('Perfil actualizado con éxito')).toBeVisible();
}

export interface EnterUserOptions {
  creator?: boolean;
  role?: 'USER' | 'CREATOR' | 'ADMIN';
  scenario?: string;
  prefix?: string;
  fullName?: string;
}

/**
 * Unique user against the live API: register → verify email in DB → UI login → onboarding.
 * Each spec must call this (or register via the form) — do not share storageState.
 * When scenario is provided, generates an isolated namespace for parallel safety.
 */
export async function enterAsNewUser(
  page: Page,
  options: EnterUserOptions = {},
): Promise<E2eAccount> {
  const account = options.scenario
    ? createScenarioAccount({
        scenario: options.scenario,
        role: options.role,
        prefix: options.prefix,
        fullName: options.fullName,
      })
    : uniqueAccount(options.prefix ?? 'e2e');

  await prepareGuest(page);
  const api = await request.newContext({
    extraHTTPHeaders: { 'Content-Type': 'application/json' },
  });
  try {
    await registerViaApi(api, account);
  } finally {
    await api.dispose();
  }
  await markEmailVerified(account.email);
  await loginViaUi(page, account);
  await completeOnboarding(page);
  await expect(page.locator('nav').first()).toBeVisible({ timeout: 15_000 });
  if (options.creator) {
    await becomeCreator(page);
  }
  return account;
}

export async function publishPostWithCaption(
  page: Page,
  caption: string,
): Promise<void> {
  await page.goto('/create?mode=post');
  await expect(page.getByTestId('content-composer')).toHaveAttribute(
    'data-create-mode',
    'POST',
  );
  await page.locator('input[type="file"]').setInputFiles(POST_IMAGE);
  await expect(page.getByTestId('edit-preview-frame')).toBeVisible({
    timeout: 20_000,
  });
  await page
    .locator('header')
    .getByRole('button', { name: 'Siguiente' })
    .click();
  await page.getByPlaceholder('Escribe una descripción...').fill(caption);
  await page
    .locator('header')
    .getByRole('button', { name: 'Compartir' })
    .click();
  await expect(page).not.toHaveURL(/\/create/, { timeout: 30_000 });
}

/** Ranked Home is not guaranteed to show a brand-new post. Own grid is. */
export async function openOwnLatestPost(
  page: Page,
  username: string,
): Promise<void> {
  await page.goto(`/${username}`);
  const tile = page.locator('a[href^="/p/"]').first();
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();
  await expect(page).toHaveURL(/\/p\//);
}
