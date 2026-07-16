import { expect, test } from '@playwright/test';

test.describe('Monetization & Virtual Economy', () => {
  test('should show paywall for premium posts and allow unlocking', async ({
    page,
  }) => {
    // 1. Mock the authenticated user with an initial balance of 500 tokens
    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'mock-user-123',
          email: 'test@example.com',
          role: 'USER',
          profile: {
            username: 'mockuser',
            fullName: 'Mock User',
            avatar: 'https://placehold.co/100',
          },
          wallet: {
            tokens: 500,
            earnedTokens: 0,
          },
        },
      });
    });

    // 2. Mock a feed containing a locked premium post
    await page.route('**/api/v1/feed/foryou*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [
            {
              id: 'mock-post-1',
              caption: 'Exclusive Premium Content',
              isPremium: true,
              price: 100,
              priceTokens: 100,
              isLocked: true, // This triggers the PaywallOverlay
              user: {
                id: 'mockcreator',
                profile: {
                  username: 'mockcreator',
                  fullName: 'Mock Creator',
                  avatar: 'https://placehold.co/100',
                },
              },
              _count: { likes: 0, comments: 0 },
              createdAt: new Date().toISOString(),
              media: [
                {
                  id: 'media-1',
                  url: 'https://placehold.co/400x500',
                  thumbnailUrl: 'https://placehold.co/400x500',
                  standardUrl: 'https://placehold.co/400x500',
                  type: 'IMAGE',
                  order: 0,
                },
              ],
            },
          ],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
      });
    });

    // 3. Mock the unlock endpoint
    await page.route('**/api/v1/monetization/unlock', async (route) => {
      const requestBody = JSON.parse(route.request().postData() || '{}');
      expect(requestBody.postId).toBe('mock-post-1');

      await route.fulfill({
        status: 201,
        json: {
          message: 'Post unlocked successfully',
          remainingTokens: 400, // 500 - 100
        },
      });
    });

    // Go to the home page / feed
    await page.goto('/');

    // Verify the paywall overlay is visible on the post
    // Just find the lock icon or the overlay container
    const paywallOverlay = page
      .getByRole('heading', { name: /Premium|Exclusivo|Exclusive/i })
      .first();
    await expect(paywallOverlay).toBeVisible({ timeout: 10000 });

    // Verify the unlock button displays the correct price
    const unlockButton = page
      .getByRole('button', { name: /Unlock|Desbloquear/i })
      .first();
    await expect(unlockButton).toBeVisible();

    // 4. Click the unlock button
    await unlockButton.click();

    // 5. Expect a success toast to appear
    await expect(
      page.getByText(/desbloqueada con éxito|Post successfully unlocked/i).first(),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test('should allow subscribing to a creator', async ({ page }) => {
    // 1. Mock the user
    await page.route('**/api/v1/users/me', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          id: 'mock-user-123',
          email: 'test@example.com',
          wallet: { tokens: 1000 },
        },
      });
    });

    // 2. Mock a Creator's profile page
    await page.route('**/api/v1/profiles/mockcreator', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          userId: 'creator-999',
          username: 'mockcreator',
          fullName: 'Mock Creator',
          accountType: 'CREATOR', // Triggers the subscribe button
          bio: 'I am a creator',
          followersCount: 10,
          followingCount: 5,
        },
      });
    });

    await page.route('**/api/v1/posts/user/mockcreator*', async (route) => {
      await route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        },
      });
    });

    await page.route('**/api/v1/follows/check/mockcreator', async (route) => {
      await route.fulfill({
        status: 200,
        json: { following: false, status: 'NONE' },
      });
    });

    await page.route('**/api/v1/stories/user/mockcreator', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    await page.route('**/api/v1/highlights/user/*', async (route) => {
      await route.fulfill({ status: 200, json: [] });
    });

    // 3. Mock the Subscribe endpoint
    await page.route('**/api/v1/creator/subscribe', async (route) => {
      const requestBody = JSON.parse(route.request().postData() || '{}');
      expect(requestBody.creatorId).toBe('creator-999');

      await route.fulfill({
        status: 201,
        json: { message: 'Subscribed successfully' },
      });
    });

    // Go to the creator's profile
    await page.goto('/mockcreator');

    // Find and click the Subscribe button
    const subscribeButton = page
      .locator('button')
      .filter({ hasText: /subscribe|suscribir/i })
      .first();
    await expect(subscribeButton).toBeVisible({ timeout: 10000 });

    await subscribeButton.click();

    // Verify the success toast
    await expect(
      page.getByText(/subscri|suscrito|success/i).first(),
    ).toBeVisible({
      timeout: 5000,
    });
  });
});
