import { expect, test } from '@playwright/test';

test.describe('Happy Path', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test('should allow a user to register, login, and see the feed', async ({
    page,
  }) => {
    test.setTimeout(90000); // Increased timeout for the full flow

    // Capture console logs
    page.on('console', (msg) => {
      console.log(`BROWSER CONSOLE: ${msg.type()}: ${msg.text()}`);
    });

    page.on('response', async (response) => {
      if (response.status() >= 400 && response.url().includes('/api/v1/')) {
        try {
          const body = await response.json();
          console.log(
            `NETWORK ERROR RESPONSE: ${response.status()} ${response.url()}:`,
            JSON.stringify(body, null, 2),
          );
        } catch {
          console.log(
            `NETWORK ERROR RESPONSE: ${response.status()} ${response.url()} (could not parse body)`,
          );
        }
      }
    });

    await page.goto('/');

    // Directly navigate to the registration page to ensure we are there
    await page.goto('/accounts/emailsignup');

    const randomUser = `user_${Math.floor(Math.random() * 10000)}`;
    const email = `${randomUser}@example.com`;

    await page.locator('#email').fill(email);
    await page.locator('#username').fill(randomUser);
    await page.locator('#fullName').fill('E2E Test User');
    await page.locator('#password').fill('Password123!');

    // Wait for the registration API call to complete
    const responsePromise = page.waitForResponse('**/api/v1/auth/register', {
      timeout: 15000,
    });
    await page.locator('button[type="submit"]').click();

    const response = await responsePromise;
    if (!response.ok()) {
      throw new Error(`Registration failed: ${response.status()}`);
    }

    // 3. Verify redirection
    await expect(page).not.toHaveURL(/.*emailsignup/);

    // 4. Login (force logout first so it doesn't auto-redirect to feed)
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/accounts/login');
    await page.locator('#identifier').fill(email);
    await page.locator('#password').fill('Password123!');
    await page.locator('button[type="submit"]').click();

    // Check for login errors
    const errorAlert = page.locator('div[class*="bg-red-500/10"]');
    if (await errorAlert.isVisible({ timeout: 2000 })) {
      const msg = await errorAlert.innerText();
      throw new Error(`Login failed: ${msg}`);
    }

    // 5. Check Feed - wait for the navigation sidebar which only shows when authenticated
    await expect(page).toHaveURL(/.*feed|\/$/, { timeout: 15000 });
    const sidebarNav = page.locator('nav').first();
    await expect(sidebarNav).toBeVisible({ timeout: 15000 });

    // Check for the Create button in the sidebar
    const createBtn = page
      .getByRole('button', { name: /Create|Crear/i })
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15000 });

    // 6. Create Post
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
    await expect(fileInput).toBeAttached({ timeout: 10000 });
    await fileInput.setInputFiles({
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'fake-image-data-at-least-some-bytes-to-be-valid-ish',
      ),
    });

    // Move to caption
    await page.getByRole('button', { name: 'Next' }).click();

    // Add caption
    const captionText = `Test post ${Math.floor(Math.random() * 1000)}`;
    await page.getByPlaceholder('Write a caption...').fill(captionText);

    // Share
    await page.getByRole('button', { name: 'Share' }).click();

    // Verify in feed
    await expect(page).toHaveURL(/.*feed|.*\//, { timeout: 20000 });
    await expect(page.getByText(captionText)).toBeVisible({ timeout: 20000 });

    // 7. Profile Editing
    await page.goto('/accounts/edit');
    await expect(page.getByText('Settings')).toBeVisible({ timeout: 15000 });

    // Wait for bio to be hydrated
    const bioField = page.locator('#bio');
    await expect(bioField).toBeVisible({ timeout: 15000 });

    const newBio = `This is a test bio ${Math.floor(Math.random() * 1000)}`;
    await bioField.fill(newBio);

    // Ensure Submit button is enabled
    const submitBtn = page.getByRole('button', { name: /Guardar|Save|Submit/i }).first();
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    // Verify success message
    await expect(page.getByText(/Profile updated successfully|¡Perfil actualizado con éxito!/i).first()).toBeVisible({ timeout: 15000 });

    // Verify on profile page
    await page.goto(`/${randomUser}`);
    await expect(page.getByText(newBio)).toBeVisible({ timeout: 20000 });
  });
});
