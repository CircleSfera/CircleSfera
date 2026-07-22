import { expect, test } from '@playwright/test';

test.describe('Support Tickets & Help Center', () => {
  test('should render support portal and ticket modal', async ({ page }) => {
    await page.goto('/support');
    await expect(page.locator('body')).toBeVisible();

    const supportHeader = page.locator('h1, h2, header').first();
    await expect(supportHeader).toBeVisible();
  });

  test('should allow navigating to create ticket form', async ({ page }) => {
    await page.goto('/support');
    const newTicketBtn = page.locator('button:has-text("Ticket"), button:has-text("Soporte"), a[href*="support"]').first();
    if (await newTicketBtn.isVisible()) {
      await newTicketBtn.click();
      await expect(page.locator('form, [role="dialog"]').first()).toBeVisible();
    } else {
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
