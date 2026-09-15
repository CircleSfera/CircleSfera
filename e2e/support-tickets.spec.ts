import { expect, test } from '@playwright/test';
import { enterAsNewUser, prepareGuest } from './helpers/session.js';

test.describe('Support', () => {
  test('guest sees the portal and login hint', async ({ page }) => {
    await prepareGuest(page);
    await page.goto('/support');
    await expect(
      page.getByRole('heading', { name: 'Asistencia técnica directa.' }),
    ).toBeVisible();
  });

  test('authenticated user can submit a ticket', async ({ page }) => {
    await enterAsNewUser(page);
    await page.goto('/support');
    await page.locator('#subject').fill('Ticket E2E');
    await page
      .locator('#message')
      .fill('Automated Playwright support ticket from a unique account.');
    await page.getByRole('button', { name: 'Enviar mensaje' }).click();
    await expect(page.getByText('Mensaje enviado')).toBeVisible();
  });
});
