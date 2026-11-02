import { expect, test } from '@playwright/test';
import { enterAsNewUser } from './helpers/session.js';
import {
  addVirtualAuthenticator,
  storedCredentials,
} from './helpers/webauthn.js';

// A passkey from end to end against the live API, with a virtual platform
// authenticator in Chromium: it is registered in Settings → Security, the
// person signs out and back in with it alone (no password), and it is
// removed after confirming with the same passkey.
test.describe('Passkeys', () => {
  test('register, sign in with it, and remove it', async ({ page }) => {
    const { cdp, authenticatorId } = await addVirtualAuthenticator(page);
    const account = await enterAsNewUser(page);

    // Register.
    await page.goto('/accounts/security');
    const register = page.waitForResponse(
      (res) =>
        res.url().includes('/auth/passkey/register-verify') &&
        res.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'Añadir Nueva Llave de Seguridad' })
      .click();
    expect((await register).ok()).toBe(true);
    await expect(
      page.getByText('¡Passkey registrada con éxito!'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Eliminar passkey' }),
    ).toHaveCount(1);
    expect(await storedCredentials(cdp, authenticatorId)).toBe(1);

    // Sign out, and back in with the passkey only.
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/accounts\/login|\/$/);
    await page.goto('/accounts/login');
    await page.locator('#identifier').fill(account.email);
    const signIn = page.waitForResponse(
      (res) =>
        res.url().includes('/auth/passkey/login-verify') &&
        res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Entrar con Passkey' }).click();
    expect((await signIn).ok()).toBe(true);
    await expect(page).not.toHaveURL(/\/accounts\/login/, { timeout: 20_000 });

    // Remove it, confirming with the same passkey.
    await page.goto('/accounts/security');
    const remove = page.getByRole('button', { name: 'Eliminar passkey' });
    await expect(remove).toHaveCount(1);
    const removed = page.waitForResponse(
      (res) =>
        res.url().includes('/auth/passkey/') &&
        res.request().method() === 'DELETE',
    );
    await remove.click();
    expect((await removed).ok()).toBe(true);
    await expect(
      page.getByText('Aún no tienes ninguna passkey registrada.'),
    ).toBeVisible();
  });
});
