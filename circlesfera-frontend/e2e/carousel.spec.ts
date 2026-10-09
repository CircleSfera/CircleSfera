import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { testPost } from './helpers/session';

/**
 * The carousel of a post with several photos: swiped with a finger on a
 * phone, moved with arrows where there is a pointer.
 */
const COLOURS = ['#8c52ff', '#3fa9f5', '#ff5757'];

async function openPostWithThreePhotos(page: Page) {
  await prepareComposerSession(page);
  await page.route('**/cdn.example.com/**', (route) => {
    const index = Number(/photo-(\d)/.exec(route.request().url())?.[1] ?? 0);
    return route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="${COLOURS[index]}"/></svg>`,
    });
  });
  await page.route('**/api/v1/posts/post-1', (route) =>
    route.fulfill({
      status: 200,
      json: testPost({
        media: COLOURS.map((_, order) => ({
          id: `media-${order}`,
          url: `https://cdn.example.com/uploads/photo-${order}.svg`,
          type: 'image',
          order,
        })),
      }),
    }),
  );
  await page.route('**/api/v1/comments/**', (route) =>
    route.fulfill({ status: 200, json: { data: [], meta: {} } }),
  );
  await page.goto('/p/post-1');
  await expect(
    page.getByRole('region', { name: 'Carrusel de medios' }),
  ).toBeVisible();
}

function carousel(page: Page) {
  return page.getByRole('region', { name: 'Carrusel de medios' });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a swipe changes the photo, and a second one the next', async ({
    page,
  }) => {
    await openPostWithThreePhotos(page);
    const box = await carousel(page).boundingBox();
    if (!box) throw new Error('carousel not laid out');
    const y = box.y + box.height / 2;
    const session = await page.context().newCDPSession(page);
    const swipe = async (fromX: number, toX: number) => {
      const point = (x: number) => [{ x, y }];
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(fromX),
      });
      for (let step = 1; step <= 5; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: point(fromX + ((toX - fromX) * step) / 5),
        });
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      });
    };

    await expect(carousel(page).getByText('1/3')).toBeVisible();
    await swipe(box.x + 300, box.x + 80);
    await expect(carousel(page).getByText('2/3')).toBeVisible();
    await swipe(box.x + 300, box.x + 80);
    await expect(carousel(page).getByText('3/3')).toBeVisible();
    // The last one: a further swipe stays on it.
    await swipe(box.x + 300, box.x + 80);
    await expect(carousel(page).getByText('3/3')).toBeVisible();
    await swipe(box.x + 80, box.x + 300);
    await expect(carousel(page).getByText('2/3')).toBeVisible();
  });

  test('no control of the carousel is under size', async ({ page }) => {
    await openPostWithThreePhotos(page);
    const small = await carousel(page).evaluate((region) =>
      Array.from(region.querySelectorAll<HTMLElement>('button, [role="tab"]'))
        .map((control) => control.getBoundingClientRect())
        .filter((box) => box.width > 1 && (box.width < 44 || box.height < 44))
        .map((box) => `${Math.round(box.width)}x${Math.round(box.height)}`),
    );
    expect(small).toEqual([]);
  });
});

test.describe('with a pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the arrows are 44 px, in view without hovering, and move the photo', async ({
    page,
  }) => {
    await openPostWithThreePhotos(page);
    const next = carousel(page).getByRole('button', {
      name: 'Foto o vídeo siguiente',
    });
    await expect(next).toBeVisible();
    const box = await next.boundingBox();
    expect(box?.width).toBe(44);
    expect(box?.height).toBe(44);
    // On the first photo there is nothing before it.
    await expect(
      carousel(page).getByRole('button', { name: 'Foto o vídeo anterior' }),
    ).toHaveCount(0);

    await next.click();
    await expect(carousel(page).getByText('2/3')).toBeVisible();
    await expect(
      carousel(page).getByRole('button', { name: 'Foto o vídeo anterior' }),
    ).toBeVisible();
  });
});
