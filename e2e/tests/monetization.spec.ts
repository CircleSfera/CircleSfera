import { expect, test } from '@playwright/test';

test.describe('Monetization', () => {
  test.beforeEach(async ({ page }) => {
    // Mock user auth
    await page.route('**/api/v1/auth/me', async (route) => {
      await route.fulfill({
        json: {
          data: {
            id: 'user-1',
            email: 'test@example.com',
            username: 'tester',
          },
        },
      });
    });

    // Mock post with a tip button
    await page.route('**/api/v1/feed*', async (route) => {
      await route.fulfill({
        json: {
          data: {
            items: [
              {
                id: 'post-1',
                content: 'Great content',
                author: {
                  id: 'creator-1',
                  username: 'creator',
                  profileImage: null,
                },
                media: [],
                createdAt: new Date().toISOString(),
                likesCount: 0,
                commentsCount: 0,
                visibility: 'PUBLIC',
              },
            ],
            nextCursor: null,
          },
        },
      });
    });

    // Mock likes check
    await page.route('**/api/v1/likes/check/*', async (route) => {
      await route.fulfill({ json: { data: { liked: false } } });
    });
  });

  test('User can open tip modal and initiate payment', async ({ page }) => {
    await page.goto('/');

    // Wait for the post to load
    await expect(page.locator('text=Great content')).toBeVisible();

    // Click the Tip button (Gift icon)
    // Assuming the tip button has a label containing "tip" or is recognizable
    const tipButton = page
      .locator('button[aria-label*="Tip"], button[aria-label*="tip"]')
      .first();
    await tipButton.click();

    // Check if the modal opens (expecting "Send Tip" or "Propina" or similar in a heading)
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // Select or type an amount
    // Let's assume there are preset buttons (like "€5")
    const amountButton = modal
      .locator('button')
      .filter({ hasText: '€' })
      .first();
    if (await amountButton.isVisible()) {
      await amountButton.click();
    }

    // Intercept checkout session creation
    await page.route(
      '**/api/v1/monetization/checkout-session',
      async (route) => {
        await route.fulfill({
          json: {
            data: {
              url: 'https://checkout.stripe.com/mock-url',
            },
          },
        });
      },
    );

    // Click the "Pay" or "Confirm" button
    const confirmButton = modal.locator('button[type="submit"]');

    // Sometimes we need to wait for the button to not be disabled
    await expect(confirmButton).toBeEnabled();

    // Playwright cannot easily assert the redirection to a mocked URL if the app does `window.location.href = data.url`
    // but we can listen for the request and verify it was sent
    const [request] = await Promise.all([
      page.waitForRequest(
        (req) =>
          req.url().includes('/monetization/checkout-session') &&
          req.method() === 'POST',
      ),
      confirmButton.click(),
    ]);

    expect(request.postDataJSON()).toMatchObject({
      amountCents: expect.any(Number),
      receiverId: 'creator-1',
    });
  });
});
