import { expect, type Page, test } from '@playwright/test';
import { markEmailVerified } from './helpers/backend.js';
import { enterAsNewUser, loginViaUi } from './helpers/session.js';

// Profiles of one person against the live API: a new Profile with an email
// and a password of its own (the choice offered first), signing in to it with
// them, and switching back to the first Profile without a password; and a new
// Profile that shares the first one's sign-in.

const currentProfile = (page: Page) =>
  page.locator('[aria-current="true"]').filter({ hasText: '@' });

async function openNewProfileForm(page: Page, username: string) {
  await page.goto('/accounts/profiles');
  await page.getByRole('button', { name: 'Crear un perfil nuevo' }).click();
  await page.getByLabel('Nombre de usuario').fill(username);
  await expect(page.getByText(`@${username} está disponible.`)).toBeVisible();
}

async function createAndSwitch(page: Page) {
  const created = page.waitForResponse(
    (res) =>
      /\/profiles$/.test(new URL(res.url()).pathname) &&
      res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Crear y cambiar' }).click();
  expect((await created).status()).toBe(201);
  // Creating switches to the new Profile and reloads on the home page.
  await page.waitForURL((url) => url.pathname === '/');
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(/\/accounts\/login|\/$/);
}

test.describe('Profiles', () => {
  test('a new Profile with its own email and password, signed in with them, then back without a password', async ({
    page,
  }) => {
    const account = await enterAsNewUser(page);
    const second = `${account.username}b`;
    const ownEmail = `${second}@circlesfera.test`;
    const ownPassword = `Own-${second}-9z!`;

    await openNewProfileForm(page, second);
    // Its own email and password is the choice offered first, and selected.
    const own = page.getByRole('radio', {
      name: /Con su propio correo y contraseña/,
    });
    await expect(own).toBeChecked();
    await page.getByLabel('Correo nuevo').fill(ownEmail);
    await page.getByLabel('Contraseña nueva').fill(ownPassword);
    await page.getByLabel('Tu contraseña actual').fill(account.password);
    const ownSignIn = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith('/sign-ins') &&
        res.request().method() === 'POST',
    );
    await createAndSwitch(page);
    expect((await ownSignIn).ok()).toBe(true);

    await page.goto('/accounts/profiles');
    await expect(currentProfile(page)).toContainText(`@${second}`);

    // Signing in with the new email and password opens the new Profile.
    await markEmailVerified(ownEmail);
    await signOut(page);
    await loginViaUi(page, { email: ownEmail, password: ownPassword });
    await page.goto('/accounts/profiles');
    await expect(currentProfile(page)).toContainText(`@${second}`);

    // The first Profile is the same person's: switching asks no password.
    await page
      .getByRole('button', { name: `Cambiar a @${account.username}` })
      .click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.goto('/accounts/profiles');
    await expect(currentProfile(page)).toContainText(`@${account.username}`);

    // The first Profile's own password still opens it, not the new one.
    await signOut(page);
    await loginViaUi(page, account);
    await page.goto('/accounts/profiles');
    await expect(currentProfile(page)).toContainText(`@${account.username}`);
  });

  test('a new Profile that shares the sign-in asks for no email or password', async ({
    page,
  }) => {
    const account = await enterAsNewUser(page);
    const shared = `${account.username}s`;

    await openNewProfileForm(page, shared);
    // The choice is a card around a hidden radio: chosen as a person does.
    const share = page.getByRole('radio', {
      name: /Con el mismo correo y contraseña/,
    });
    await page
      .getByText('Con el mismo correo y contraseña', { exact: true })
      .click();
    await expect(share).toBeChecked();
    await expect(page.getByLabel('Correo nuevo')).toHaveCount(0);
    await expect(page.getByLabel('Tu contraseña actual')).toHaveCount(0);
    await createAndSwitch(page);

    await page.goto('/accounts/profiles');
    await expect(currentProfile(page)).toContainText(`@${shared}`);

    // The same email and password reach both Profiles: one opens, the other
    // is a switch away.
    await signOut(page);
    await loginViaUi(page, account);
    await page.goto('/accounts/profiles');
    await expect(page.getByText(`@${account.username}`).first()).toBeVisible();
    await expect(page.getByText(`@${shared}`).first()).toBeVisible();
  });
});
