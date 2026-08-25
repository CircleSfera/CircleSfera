import { expect, test } from '@playwright/test';

/**
 * Authenticated Studio journey smoke.
 * Uses storageState from global-setup (same as creator/settings suites).
 */
test.describe('Edits Studio', () => {
  test('loads full-screen studio shell with tools and playback', async ({
    page,
  }) => {
    await page.goto('/edits');
    await expect(page).toHaveURL(/\/edits/);

    await expect(
      page.getByRole('navigation', { name: /studio tools|herramientas/i }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole('button', { name: /play|reproducir/i }),
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /next frame|fotograma siguiente/i }),
    ).toBeVisible();

    await expect(
      page.getByRole('button', { name: /fullscreen|pantalla completa/i }),
    ).toBeVisible();

    // Full-screen immersive: no app Sidebar
    await expect(page.locator('.sidebar-root')).toHaveCount(0);
    await expect(page.locator('#main-content')).not.toHaveClass(/md:pl-17/);

    // Open media tool sheet
    await page.getByRole('button', { name: /media|medios/i }).click();
    await expect(
      page.getByText(/import|importar|mp4|mov|webm/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('supports undo/redo chrome and aspect controls on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/edits');

    await expect(
      page.getByRole('button', { name: /undo|deshacer/i }),
    ).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole('button', { name: /redo|rehacer/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /export|exportar/i }),
    ).toBeVisible();
  });

  test('opens text tool and steps playhead with frame controls', async ({
    page,
  }) => {
    await page.goto('/edits');

    await expect(
      page.getByRole('navigation', { name: /studio tools|herramientas/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /text|texto/i }).click();
    await expect(
      page.getByText(/templates|plantillas|title|título/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    const timecode = page.locator('.font-mono').first();
    const before = await timecode.textContent();
    await page
      .getByRole('button', { name: /next frame|fotograma siguiente/i })
      .click();
    await expect(timecode).not.toHaveText(before || '');
  });

  test('can cancel an in-flight export', async ({ page }) => {
    await page.route('**/ffmpeg/ffmpeg-core.wasm', async () => {
      await new Promise(() => {
        /* hang until cancel aborts encode */
      });
    });

    await page.goto('/edits');
    await expect(
      page.getByRole('navigation', { name: /studio tools|herramientas/i }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /media|medios/i }).click();
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles('e2e/fixtures/studio-still.png');

    await page.getByRole('button', { name: /export|exportar/i }).click();
    await expect(page.getByTestId('studio-export-start')).toBeVisible({
      timeout: 5_000,
    });
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
