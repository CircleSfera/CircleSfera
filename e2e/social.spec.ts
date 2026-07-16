import { expect, test } from '@playwright/test';

// This test uses the globally authenticated user
test.describe('Social Features Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the home page successfully and display feed', async ({
    page,
  }) => {
    await expect(page).toHaveURL(/.*\//);
    // Ensure that some content from the feed is loaded
    await expect(page.locator('.glass-panel-post').first()).toBeVisible({
      timeout: 10000,
    });
  });

  test('should allow creating a new image post', async ({ page }) => {
    const randomText = `Este es un post de prueba automático ${Date.now()}`;

    // Navigate to create post modal
    await page.goto('/');
    // Wait for the Create button in the sidebar
    const createBtn = page
      .getByRole('button', { name: /Create|Crear/i })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();

    // Wait for the Create Bottom Sheet to appear and select "Post"
    const postOption = page
      .locator('button')
      .filter({ hasText: /Publicación|Post/i })
      .first();
    await expect(postOption).toBeVisible({ timeout: 10000 });
    await postOption.click();

    // Wait for the modal dialog to appear instead of specific text
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    const fileInput = page.locator('input[type="file"]').last();

    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });

    // We might be on EditStep now. Click "Next" or "Siguiente"
    const nextBtn = page
      .locator('button')
      .filter({ hasText: /Next|Siguiente/i })
      .first();
    await nextBtn.click();

    // Now on CaptionStep.
    // Fill the caption (use generic locator or placeholder)
    // The textarea in CaptionStep might just be a textarea.
    const captionTextarea = page.locator('textarea').first();
    await captionTextarea.fill(randomText);

    // Click submit (Share / Compartir)
    const submitBtn = page
      .locator('button')
      .filter({ hasText: /Share|Compartir/i })
      .first();
    await submitBtn.click();

    // Wait for modal to close
    await expect(dialog).toBeHidden({ timeout: 15000 });
    
    // Wait for the post to appear in the feed
    await expect(page.getByText(randomText)).toBeVisible({ timeout: 15000 });
  });

  test('should allow liking a post', async ({ page }) => {
    // Wait for feed to load
    // Wait for the feed to load posts
    await page.waitForSelector('[data-testid="like-button"]', {
      state: 'visible',
      timeout: 15000,
    });

    // Find the first like button in an article
    const likeButton = page.getByTestId('like-button').first();

    await expect(likeButton).toBeVisible({ timeout: 10000 });
    await likeButton.click();

    // No explicit expect needed if it doesn't crash, but we could check the color change
  });
});
