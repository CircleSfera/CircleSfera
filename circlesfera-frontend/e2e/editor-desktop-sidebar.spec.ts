import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  FIXTURES,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';
import { testProfile } from './helpers/session';

/**
 * On a desktop window the full-window editors and the story viewer keep the
 * sidebar in view: they start where it ends instead of covering it.
 */
test.use({ viewport: { width: 1440, height: 900 } });

async function expectSidebarInView(page: Page, inside: Locator) {
  const sidebar = page.locator('.sidebar-root');
  await expect(sidebar).toBeVisible();
  const sidebarBox = await sidebar.boundingBox();
  const controlBox = await inside.first().boundingBox();
  expect(sidebarBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  const sidebarEnd = (sidebarBox?.x ?? 0) + (sidebarBox?.width ?? 0);
  // The layer begins after the sidebar…
  expect(controlBox?.x ?? 0).toBeGreaterThanOrEqual(sidebarEnd);

  // …and nothing of it lies over the sidebar.
  const covered = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('.sidebar-root');
    if (!bar) return true;
    const box = bar.getBoundingClientRect();
    return [100, 450, 800].some((y) => {
      const top = document.elementFromPoint(box.right - 4, y);
      return !top || !bar.contains(top);
    });
  });
  expect(covered).toBe(false);
}

test('the photo editor leaves the sidebar in view', async ({ page }) => {
  await prepareComposerSession(page);
  await openComposer(page, 'post');
  await uploadFixture(page, FIXTURES.postImage);
  await waitEditPreviewReady(page, '4:5');
  await page
    .getByRole('toolbar')
    .getByRole('button', { name: 'Ajustar' })
    .click();
  await expect(page.getByRole('tab', { name: /Ajustar/ })).toBeVisible();
  await expectSidebarInView(
    page,
    page.getByRole('button', { name: 'Cancelar' }),
  );
});

test('the story composer leaves the sidebar in view', async ({ page }) => {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();
  await expect(
    page.getByRole('button', { name: 'Fondo', exact: true }),
  ).toBeVisible();
  await expectSidebarInView(
    page,
    page.getByRole('button', { name: 'Fondo', exact: true }),
  );
});

test('the story viewer leaves the sidebar in view', async ({ page }) => {
  await prepareComposerSession(page);
  await page.route('**/api/v1/stories**', (route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: 'story-1',
          profileId: 'profile-ana',
          profile: { ...testProfile(), id: 'profile-ana', username: 'ana' },
          mediaUrl: 'https://cdn.example.com/uploads/story.jpg',
          mediaType: 'image',
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          views: [],
          _count: { views: 0 },
        },
      ],
    }),
  );
  await page.goto('/');
  await page.locator('button[aria-label*="ana"]').first().click();
  const viewer = page.locator('[data-content-shell="playback"]').last();
  await expect(viewer).toBeVisible();
  await expectSidebarInView(page, viewer);
});

test('the edits studio keeps the sidebar as a narrow rail of icons', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await page.goto('/edits');
  const exportButton = page.getByRole('button', { name: 'Exportar' });
  await expect(exportButton).toBeVisible();
  const sidebarBox = await page.locator('.sidebar-root').boundingBox();
  // Narrow even on a wide window, where other screens show it with labels.
  expect(sidebarBox?.width).toBe(68);
  await expectSidebarInView(page, page.locator('main button').first());
});

test('the explore map leaves the sidebar in view', async ({ page }) => {
  await prepareComposerSession(page);
  await page.goto('/explore/map');
  const back = page.locator('main button').first();
  await expect(back).toBeVisible();
  await expectSidebarInView(page, back);
});
