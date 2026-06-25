import { expect, test } from '@playwright/test';

test.describe('Social Features Navigation', () => {
  test('should load the home page successfully', async ({ page }) => {
    // Attempt to load home page (may redirect to login if unauthenticated, but server responds)
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
  });
});
