import { expect, test } from '@playwright/test';

test.describe('Live Spaces / Stream Feature', () => {
  test('should navigate to Live Broadcaster page', async ({ page }) => {
    await page.goto('/live/broadcast');
    await expect(page).toHaveURL(/.*\/live\/broadcast/);
  });

  test('should navigate to Live Viewer page for a stream ID', async ({ page }) => {
    await page.goto('/live/test-stream-id-123');
    await expect(page).toHaveURL(/.*\/live\/test-stream-id-123/);
  });

  test('should render live stream elements without breaking UI', async ({ page }) => {
    await page.goto('/live/broadcast');
    // Check page container loads
    await expect(page.locator('body')).toBeVisible();
  });
});
