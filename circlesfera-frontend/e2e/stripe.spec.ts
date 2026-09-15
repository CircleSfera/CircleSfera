import { expect, test } from '@playwright/test';
import { prepareAuthenticatedSession } from './helpers/session';

test.describe('Creator Stripe Connect', () => {
  test('pulsa Conectar Stripe y pide la URL al backend', async ({ page }) => {
    await prepareAuthenticatedSession(page, { accountType: 'CREATOR' });

    await page.route('**/api/v1/monetization', async (route) => {
      await route.fulfill({
        status: 200,
        json: { hasStripeAccount: false, lifetimeEarningsCents: 0 },
      });
    });

    await page.route('**/api/v1/creator/**', async (route) => {
      await route.fulfill({ status: 200, json: {} });
    });

    const connectCall = page.waitForRequest(
      (req) =>
        req.url().includes('/api/v1/monetization/connect') &&
        req.method() === 'POST',
    );

    await page.route('**/api/v1/monetization/connect**', async (route) => {
      await route.fulfill({
        status: 200,
        json: { url: 'https://connect.stripe.com/setup/s/mock-url' },
      });
    });

    await page.route('https://connect.stripe.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>stripe-mock</body></html>',
      });
    });

    await page.goto('/creator/monetization');
    await page.getByRole('button', { name: 'Conectar Stripe' }).click();
    await connectCall;
    await expect(page).toHaveURL(/connect\.stripe\.com/);
  });
});
