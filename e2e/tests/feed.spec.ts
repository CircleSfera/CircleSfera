import { expect, test } from '@playwright/test';

test.describe('Feed', () => {
  // Use a beforeEach to mock the feed response so we don't need a real backend for the UI tests
  test.beforeEach(async ({ page }) => {
    // Mock the feed API
    await page.route('**/api/v1/feed*', async (route) => {
      const json = {
        data: {
          items: [
            {
              id: 'post-1',
              content: 'Hello Playwright!',
              author: {
                id: 'user-1',
                username: 'playwright_user',
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
      };
      await route.fulfill({ json });
    });

    // Mock likes check
    await page.route('**/api/v1/likes/check/*', async (route) => {
      await route.fulfill({ json: { data: { liked: false } } });
    });

    // Mock auth/me if needed, assuming the frontend uses it to check session
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
  });

  test('Feed displays posts and user can like', async ({ page }) => {
    // Intercept backend login call
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
        json: {
          data: {
            token: 'mock-token',
            user: {
              id: 'user-1',
              email: 'test@example.com',
              username: 'tester',
            },
          },
        },
      });
    });

    // Login first
    await page.goto('/login');
    await page.fill('input[id="identifier"]', 'test@example.com');
    await page.fill('input[id="password"]', 'Password123!');
    await page.click('button[type="submit"]');

    // Wait for feed redirect
    await page.waitForURL('/');

    // Verify post content is visible
    await expect(page.locator('text=Hello Playwright!')).toBeVisible();

    // Find the like button
    const likeButton = page.getByTestId('like-button').first();
    await expect(likeButton).toBeVisible();

    // Mock the like POST request
    await page.route('**/api/v1/likes/toggle/*', async (route) => {
      await route.fulfill({ json: { data: { liked: true } } });
    });

    // Click like
    await likeButton.click();

    // The icon should reflect the like (you can check aria-label or just that no errors occurred)
    await expect(likeButton).toHaveAttribute('aria-label', 'Unlike post');
  });
});
