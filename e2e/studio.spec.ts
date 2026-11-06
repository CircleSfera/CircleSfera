import { expect, type Page, test } from '@playwright/test';
import { enterAsNewUser, POST_IMAGE } from './helpers/session.js';

/** The studio opens on its projects; a new one opens the editor. */
async function openNewProject(page: Page) {
  await page.goto('/edits');
  await page.getByRole('button', { name: 'Nuevo proyecto' }).click();
  await expect(page).toHaveURL(/\/edits\/editor/);
}

test.describe('Edits Studio', () => {
  test('loads studio chrome and can import a still', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'studio' });
    await openNewProject(page);
    await expect(
      page.getByRole('navigation', { name: 'Herramientas de Studio' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Reproducir' }),
    ).toBeVisible();
    // The editor keeps the sidebar, as a narrow rail of icons.
    await expect(page.locator('.sidebar-root.sidebar-compact')).toHaveCount(1);

    await page.getByTestId('studio-media-input').setInputFiles(POST_IMAGE);
    await expect(
      page.locator('[data-studio-main-track] [data-studio-clip]'),
    ).toHaveCount(1);
  });

  test('undo/redo and export chrome on desktop', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'studio' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openNewProject(page);
    await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rehacer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  test('can cancel an in-flight export', async ({ page }) => {
    await enterAsNewUser(page, { scenario: 'studio' });
    await page.route('**/ffmpeg/ffmpeg-core.wasm', async () => {
      await new Promise(() => {
        /* hang until cancel aborts encode — isolate wasm, not Nest */
      });
    });
    await openNewProject(page);
    await page.getByTestId('studio-media-input').setInputFiles(POST_IMAGE);
    // Export waits for the file to be uploaded.
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeEnabled({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Exportar' }).click();
    await expect(page.getByTestId('studio-export-start')).toBeVisible();
    await page.getByTestId('studio-export-start').click();
    await expect(page.getByTestId('studio-export-cancel')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId('studio-export-cancel').click();
    await expect(page.getByTestId('studio-export-cancel')).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
