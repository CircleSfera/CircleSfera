import { expect, test } from '@playwright/test';
import {
  prepareAuthenticatedSession,
  TEST_USER,
  testProfile,
} from './helpers/session';

test.describe('Perfil', () => {
  test('ve el perfil y guarda una bio nueva', async ({ page }) => {
    const profile = testProfile({
      bio: 'Biografía original',
    });

    await prepareAuthenticatedSession(page);

    await page.route(
      `**/api/v1/profiles/${TEST_USER.username}`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({ status: 200, json: profile });
          return;
        }
        await route.continue();
      },
    );

    await page.route('**/api/v1/posts/user/**', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        },
      });
    });

    await page.goto(`/${TEST_USER.username}`);
    await expect(page.getByText(TEST_USER.displayName).first()).toBeVisible();
    await expect(page.getByText('Biografía original').first()).toBeVisible();

    await page.getByRole('link', { name: 'Ajustes' }).first().click();
    await page.locator('a[href="/accounts/profile"]').first().click();

    const bioInput = page.getByPlaceholder('Cuéntale al mundo tu historia...');
    await expect(bioInput).toBeVisible();
    await bioInput.fill('Biografía actualizada');

    await page.route('**/api/v1/profiles/me', async (route) => {
      const method = route.request().method();
      if (method === 'PUT' || method === 'PATCH') {
        profile.bio = 'Biografía actualizada';
        await route.fulfill({ status: 200, json: profile });
        return;
      }
      await route.fulfill({ status: 200, json: profile });
    });

    await page.route(
      `**/api/v1/profiles/${TEST_USER.username}`,
      async (route) => {
        await route.fulfill({ status: 200, json: profile });
      },
    );

    await page
      .getByRole('button', { name: 'Guardar Cambios del Perfil' })
      .click();
    await expect(page.getByText('Perfil actualizado con éxito')).toBeVisible();

    await page.goto(`/${TEST_USER.username}`);
    await expect(page.getByText('Biografía actualizada').first()).toBeVisible();
  });
});
