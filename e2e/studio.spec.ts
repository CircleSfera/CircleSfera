import { expect, test } from '@playwright/test';
import { enterAsNewUser, POST_IMAGE } from './helpers/session.js';

test.describe('Edits Studio', () => {
  test('loads studio chrome and can import a still', async ({ page }) => {
    await enterAsNewUser(page);
    await page.goto('/edits');
    await expect(page).toHaveURL(/\/edits/);
    await expect(
      page.getByRole('navigation', { name: 'Herramientas de Studio' }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: 'Reproducir' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Fotograma siguiente' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Pantalla completa' }),
    ).toBeVisible();
    await expect(page.locator('.sidebar-root')).toHaveCount(0);

    await page.getByRole('button', { name: 'Medios' }).click();
    await page.locator('input[type="file"]').setInputFiles(POST_IMAGE);
  });

  test('undo/redo and export chrome on desktop', async ({ page }) => {
    await enterAsNewUser(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/edits');
    await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rehacer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
  });

  test('can cancel an in-flight export', async ({ page }) => {
    await enterAsNewUser(page);
    await page.route('**/ffmpeg/ffmpeg-core.wasm', async () => {
      await new Promise(() => {
        /* hang until cancel aborts encode — isolate wasm, not Nest */
      });
    });
    await page.goto('/edits');
    await expect(
      page.getByRole('navigation', { name: 'Herramientas de Studio' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Medios' }).click();
    await page.locator('input[type="file"]').setInputFiles(POST_IMAGE);
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
