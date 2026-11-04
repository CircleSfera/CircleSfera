import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { testPost, testProfile } from './helpers/session';

// A Profile hides words from the comments on its posts, and then finds the
// comments that had one under its post, to show them if it wants.
const SHOTS = process.env.HIDDEN_WORDS_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

for (const [name, size] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`hidden words on a ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await prepareComposerSession(page);
    const words = ['feo'];
    await page.route(/api\/v1\/hidden-words$/, async (route) => {
      if (route.request().method() === 'POST') {
        words.unshift(route.request().postDataJSON().word);
        return route.fulfill({ status: 201, json: { word: words[0] } });
      }
      return route.fulfill({
        status: 200,
        json: {
          words: words.map((word) => ({ word, createdAt: '2026-11-01' })),
          max: 500,
        },
      });
    });

    await page.goto('/accounts/hidden_words');
    await expect(page.getByText('feo')).toBeVisible();
    await page
      .getByRole('textbox', { name: /palabra, frase o emoji/ })
      .fill('pésimo');
    await page.getByRole('button', { name: 'Añadir' }).click();
    await expect(page.getByText('pésimo')).toBeVisible();
    await expect(page.getByText('2 de 500')).toBeVisible();
    const remove = await page
      .getByRole('button', { name: 'Quitar feo' })
      .boundingBox();
    expect(remove?.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${name}-settings`);

    await page.route('**/api/v1/posts/post-1', (route) =>
      route.fulfill({ status: 200, json: testPost({ caption: 'Atardecer' }) }),
    );
    const ana = { ...testProfile(), id: 'profile-ana', username: 'ana' };
    await page.route(/api\/v1\/posts\/post-1\/comments\/hidden$/, (route) =>
      route.fulfill({
        status: 200,
        json: {
          data: [
            {
              id: 'h1',
              content: 'qué foto tan fea',
              postId: 'post-1',
              profileId: 'profile-ana',
              profile: ana,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }),
    );
    await page.route(/api\/v1\/posts\/post-1\/comments(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        json: {
          data: [],
          meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
        },
      }),
    );
    const shown = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/comments/h1/show'),
    );
    await page.route(/comments\/h1\/show$/, (route) =>
      route.fulfill({ status: 201, json: {} }),
    );
    await page.goto('/p/post-1');
    await page.getByRole('button', { name: 'Comentarios ocultos (1)' }).click();
    await expect(page.getByText('qué foto tan fea')).toBeVisible();
    await shot(page, `${name}-hidden`);
    await page.getByRole('button', { name: 'Mostrar' }).click();
    await shown;
  });
}
