import { expect, test } from '@playwright/test';
import {
  prepareAuthenticatedSession,
  testPost,
  testProfile,
} from './helpers/session';

/**
 * The frames viewer renders once per real change. The active frame hands its
 * menu to the page; doing so again on every render made the page render
 * without end, which the browser reports as an error.
 */
test('the frames viewer does not render in a loop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const loops: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /update depth/i.test(message.text())) {
      loops.push(message.text());
    }
  });
  await prepareAuthenticatedSession(page);
  const ana = { ...testProfile(), id: 'profile-ana', username: 'ana' };
  const frames = [0, 1].map((index) =>
    testPost({
      id: `frame-${index}`,
      type: 'FRAME',
      profileId: 'profile-ana',
      profile: ana,
      caption: 'Atardecer en la costa',
      media: [
        {
          id: `media-${index}`,
          url: 'https://cdn.example.com/frame.mp4',
          type: 'video',
          order: 0,
        },
      ],
    }),
  );
  await page.route('**/api/v1/posts/frames**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        data: frames,
        meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
      },
    }),
  );
  await page.route('**/cdn.example.com/**', (route) => route.abort());

  await page.goto('/frames');
  await expect(page.locator('[data-index="0"]')).toBeVisible();
  // Long enough for a loop to show: it reported within the first second.
  await page.waitForTimeout(2000);

  expect(loops).toEqual([]);
});
