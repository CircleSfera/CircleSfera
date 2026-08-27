import { expect, test } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('App loads successfully and shows login/landing page', async ({
    page,
  }) => {
    // Go to the root URL (configured in baseURL)
    await page.goto('/');

    // Wait for the app to render some content
    // We expect the title to be CircleSfera
    await expect(page).toHaveTitle(/CircleSfera/);

    // Depending on auth state, we might see Login or Landing page
    // We just check that the root DOM element exists
    const root = page.locator('#root');
    await expect(root).toBeAttached();

    // Check that there are no immediate unhandled JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    await page.goto('/');
    expect(errors).toHaveLength(0);
  });
});
