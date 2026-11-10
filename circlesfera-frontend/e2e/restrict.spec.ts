import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { testPost, testProfile } from './helpers/session';

// A Profile restricts another from its profile, from a comment and from
// Settings, and approves a comment by a restricted account. The restricted
// Profile is never told, so nothing here is shown to it.
const SHOTS = process.env.RESTRICT_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const ana = () => ({
  ...testProfile(),
  id: 'profile-ana',
  userId: 'user-ana',
  username: 'ana',
  fullName: 'Ana Ruiz',
  _count: { posts: 3, followers: 10, following: 4 },
});

for (const [name, size] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`restrict on a ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await prepareComposerSession(page);
    let restricted = false;
    await page.route(/api\/v1\/users\/ana\/follow\/restriction$/, (route) =>
      route.fulfill({ status: 200, json: { restricted } }),
    );
    await page.route(/api\/v1\/users\/ana\/follow\/(un)?restrict$/, (route) => {
      restricted = route.request().url().endsWith('/restrict');
      return route.fulfill({ status: 201, json: { restricted } });
    });

    // From the profile's menu.
    await page.route('**/api/v1/profiles/ana', (route) =>
      route.fulfill({ status: 200, json: ana() }),
    );
    await page.goto('/ana');
    await page
      .getByRole('button', { name: 'Más opciones' })
      .filter({ visible: true })
      .click();
    const restrict = page.getByRole('button', { name: 'Restringir' });
    await expect(restrict).toBeEnabled();
    expect((await restrict.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${name}-profile-menu`);
    await restrict.click();
    await expect(
      page.getByText('Has restringido a ana. No se le avisará.'),
    ).toBeVisible();
    expect(restricted).toBe(true);

    // From a comment on one's own post, and approving one that waits.
    await page.route('**/api/v1/posts/post-1', (route) =>
      route.fulfill({ status: 200, json: testPost({ caption: 'Atardecer' }) }),
    );
    const comment = (id: string, content: string, more: object = {}) => ({
      id,
      content,
      postId: 'post-1',
      profileId: 'profile-ana',
      profile: ana(),
      likes: [],
      _count: { likes: 0 },
      createdAt: new Date().toISOString(),
      ...more,
    });
    await page.route(/api\/v1\/posts\/post-1\/comments\/hidden$/, (route) =>
      route.fulfill({
        status: 200,
        json: {
          data: [comment('w1', 'me encanta', { awaitingApproval: true })],
        },
      }),
    );
    await page.route(/api\/v1\/posts\/post-1\/comments(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        json: {
          data: [comment('c1', 'qué bonito')],
          meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
        },
      }),
    );
    const approved = page.waitForRequest(
      (r) => r.method() === 'POST' && r.url().endsWith('/comments/w1/show'),
    );
    await page.route(/comments\/w1\/show$/, (route) =>
      route.fulfill({ status: 201, json: {} }),
    );
    await page.goto('/p/post-1');
    const fromComment = page.getByRole('button', { name: 'Restringir a ana' });
    await expect(fromComment).toBeVisible();
    await page.getByRole('button', { name: 'Comentarios ocultos (1)' }).click();
    await expect(page.getByText('Cuenta restringida')).toBeVisible();
    await shot(page, `${name}-comments`);
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await approved;

    // In Settings, among the accounts one blocks, mutes or restricts.
    await page.route(/api\/v1\/users\/me\/follow\/restricted$/, (route) =>
      route.fulfill({ status: 200, json: restricted ? [ana()] : [] }),
    );
    await page.route(/api\/v1\/users\/me\/follow\/(blocked|muted)$/, (route) =>
      route.fulfill({ status: 200, json: [] }),
    );
    await page.goto('/accounts/mutes');
    await expect(page.getByText('Cuentas restringidas')).toBeVisible();
    const unrestrict = page.getByRole('button', {
      name: 'Dejar de restringir',
    });
    await expect(unrestrict).toBeVisible();
    await shot(page, `${name}-settings`);
    await unrestrict.click();
    await expect(page.getByText('No has restringido a nadie.')).toBeVisible();
    expect(restricted).toBe(false);
  });
}
