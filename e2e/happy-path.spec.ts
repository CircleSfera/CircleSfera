import { expect, test } from '@playwright/test';

test.describe('Happy Path', () => {
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

    // Check if we are on landing or login
    if (await page.getByText('Share Your Universe').isVisible()) {
      await page.getByRole('link', { name: 'Get Started' }).click();
    }

    // 2. Go to Register (if not already there via Get Started)
    if (page.url().includes('login')) {
      await page.getByRole('link', { name: 'Sign up' }).click();
    }

    const randomUser = `user_${Math.floor(Math.random() * 10000)}`;
    const email = `${randomUser}@example.com`;

    await page.getByPlaceholder('you@example.com').fill(email);
    await page.getByPlaceholder('johndoe').fill(randomUser);
    await page.getByPlaceholder('John Doe').fill('E2E Test User');
    await page.getByPlaceholder('••••••••').fill('Password123!');

    await page.getByRole('button', { name: 'Sign Up', exact: true }).click();

    // Check for registration errors
    const regError = page.locator('div[class*="bg-red-500/10"]');
    if (await regError.isVisible({ timeout: 2000 })) {
      const msg = await regError.innerText();
      throw new Error(`Registration failed: ${msg}`);
    }

    // 3. Verify redirection to feed or verification message
    // If auto-authenticated on registration, it might go to / or /feed
    await expect(page).toHaveURL(/.*login|.*feed|.*/, { timeout: 15000 });

    // 4. Login
    await page.goto('/accounts/login');
    await page.getByPlaceholder('you@example.com or username').fill(email);
    await page.getByPlaceholder('••••••••').fill('Password123!');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    // Check for login errors
    const errorAlert = page.locator('div[class*="bg-red-500/10"]');
    if (await errorAlert.isVisible({ timeout: 2000 })) {
      const msg = await errorAlert.innerText();
      throw new Error(`Login failed: ${msg}`);
    }

    // 5. Check Feed - wait for the navigation sidebar which only shows when authenticated
    await expect(page).toHaveURL(/.*feed|.*\//, { timeout: 15000 });

    // Check for the Create link directly (it's inside the Main Navigation)
    const createLink = page
      .locator('nav[aria-label="Main Navigation"] a[href="/create"]')
      .first();
    await expect(createLink).toBeVisible({ timeout: 15000 });

    // 6. Create Post
    await createLink.click();

    // Wait for the modal content to appear
    await expect(page.getByText('Select from computer')).toBeVisible({
      timeout: 15000,
    });

    // Select-file directly using the hidden input which is more reliable
    const fileInput = page.locator('input[type="file"]').first();
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
    const bioField = page.getByPlaceholder('Tell us about yourself');
    await expect(bioField).toBeVisible({ timeout: 15000 });

    const newBio = `This is a test bio ${Math.floor(Math.random() * 1000)}`;
    await bioField.fill(newBio);

    // Ensure Submit button is enabled
    const submitBtn = page.getByRole('button', { name: 'Submit' });
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    // Verify success message
    await expect(page.getByText('Profile updated successfully!')).toBeVisible({
      timeout: 20000,
    });

    // Verify on profile page
    await page.goto(`/${randomUser}`);
    await expect(page.getByText(newBio)).toBeVisible({ timeout: 20000 });
  });
});
