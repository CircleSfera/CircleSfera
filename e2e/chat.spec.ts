import { expect, test } from '@playwright/test';

test.describe('End-to-End Encrypted Chat', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/messages');
  });

  test('should load the messages interface', async ({ page }) => {
    await expect(page).toHaveURL(/.*\/direct\/inbox/);
    await expect(page).toHaveTitle(/Messages|Mensajes/i);
  });

  test('should be able to search for a user and send a message', async ({
    page,
  }) => {
    const searchInput = page.getByPlaceholder(/Search|Buscar/i).first();

    if (await searchInput.isVisible()) {
      await searchInput.fill('admin'); // searching for admin seeded user

      // Click the first result
      const firstResult = page
        .locator('div[role="button"]')
        .filter({ hasText: /admin/i })
        .first();
      await firstResult.click();

      // Ensure the chat panel is open
      const chatComposer = page.getByPlaceholder(
        /Write a message|Escribe un mensaje/i,
      );
      await expect(chatComposer).toBeVisible();

      // Type and send a message
      const msgText = `Mensaje de prueba E2EE ${Date.now()}`;
      await chatComposer.fill(msgText);
      await chatComposer.press('Enter');

      // Check if message appears in the chat bubble
      await expect(page.getByText(msgText)).toBeVisible({ timeout: 5000 });
    }
  });
});
