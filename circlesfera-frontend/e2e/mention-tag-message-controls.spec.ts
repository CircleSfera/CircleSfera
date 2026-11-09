import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { testProfile } from './helpers/session';

// A Profile chooses who may mention, tag or message it, approves a tag that
// waits for it and takes itself off a post. Someone it leaves out is never
// told; a first message to it is refused with a plain notice.
const SHOTS = process.env.MENTION_TAG_SHOTS;

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

const bea = () => ({
  ...testProfile(),
  id: 'profile-bea',
  userId: 'user-bea',
  username: 'bea',
  fullName: 'Bea Gil',
  _count: { posts: 2, followers: 5, following: 3 },
});

const tag = (id: string, status: 'SHOWN' | 'PENDING') => ({
  createdAt: new Date().toISOString(),
  status,
  post: {
    id,
    caption: `Una tarde en ${id}`,
    createdAt: new Date().toISOString(),
    thumbnailUrl: null,
    profile: { id: 'profile-bea', username: 'bea' },
  },
});

for (const [name, size] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`mention, tag and message controls on a ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await prepareComposerSession(page);

    // Settings → Privacy: the choices, saved one by one.
    let saved: Record<string, unknown> = {};
    await page.route(/api\/v1\/users\/me\/settings$/, (route) => {
      if (route.request().method() === 'PUT') {
        saved = { ...saved, ...route.request().postDataJSON() };
        return route.fulfill({ status: 200, json: saved });
      }
      return route.fulfill({
        status: 200,
        json: {
          mentionsFrom: 'EVERYONE',
          tagsFrom: 'EVERYONE',
          manualTagApproval: false,
          messageRequests: true,
        },
      });
    });
    await page.goto('/accounts/privacy');
    const mentions = page.getByRole('combobox', {
      name: 'Quién puede mencionarte',
    });
    await expect(mentions).toHaveValue('EVERYONE');
    await mentions.selectOption('FOLLOWING');
    await page
      .getByRole('checkbox', { name: 'Aprobar etiquetas manualmente' })
      .locator('xpath=..')
      .click();
    await page
      .getByRole('checkbox', { name: 'Permitir solicitudes de mensajes' })
      .locator('xpath=..')
      .click();
    await expect
      .poll(() => saved)
      .toEqual({
        mentionsFrom: 'FOLLOWING',
        manualTagApproval: true,
        messageRequests: false,
      });
    await page
      .getByRole('heading', { name: 'Menciones, etiquetas y mensajes' })
      .scrollIntoViewIfNeeded();
    await shot(page, `${name}-privacy`);

    // Settings → Tags: approve one that waits, take oneself off another.
    let lists = {
      PENDING: [tag('pending-1', 'PENDING')],
      SHOWN: [tag('shown-1', 'SHOWN')],
    };
    await page.route(/api\/v1\/post-tags\?status=(PENDING|SHOWN)$/, (route) => {
      const status = new URL(route.request().url()).searchParams.get(
        'status',
      ) as 'PENDING' | 'SHOWN';
      return route.fulfill({ status: 200, json: { data: lists[status] } });
    });
    await page.route(/api\/v1\/post-tags\/pending-1\/approve$/, (route) => {
      lists = {
        PENDING: [],
        SHOWN: [{ ...tag('pending-1', 'SHOWN') }, ...lists.SHOWN],
      };
      return route.fulfill({ status: 201, json: {} });
    });
    await page.route(/api\/v1\/post-tags\/shown-1$/, (route) => {
      lists = {
        ...lists,
        SHOWN: lists.SHOWN.filter((t) => t.post.id !== 'shown-1'),
      };
      return route.fulfill({ status: 200, json: {} });
    });
    await page.getByRole('link', { name: 'Revisar tus etiquetas' }).click();
    await expect(page).toHaveURL(/\/accounts\/tags$/);
    const approve = page.getByRole('button', { name: 'Aprobar' });
    await expect(approve).toBeVisible();
    expect((await approve.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await shot(page, `${name}-tags`);
    await approve.click();
    await expect(page.getByText('No hay etiquetas pendientes')).toBeVisible();
    await page
      .getByRole('button', { name: 'Quitarme de la publicación de bea' })
      .nth(1)
      .click();
    await expect(page.getByText('Una tarde en shown-1')).toHaveCount(0);
    await expect(page.getByText('Una tarde en pending-1')).toBeVisible();

    // A first message to someone who takes no requests.
    await page.route('**/api/v1/profiles/bea', (route) =>
      route.fulfill({ status: 200, json: bea() }),
    );
    await page.route(/api\/v1\/chat\/conversations$/, (route) =>
      route.fulfill({
        status: 403,
        json: {
          statusCode: 403,
          errorCode: 'MESSAGE_REQUESTS_OFF',
          message: 'Message requests are off',
        },
      }),
    );
    await page.goto('/bea');
    await page
      .getByRole('button', { name: 'Mensaje' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(
      page.getByText('Esta cuenta no acepta solicitudes de mensajes.'),
    ).toBeVisible();
    await shot(page, `${name}-message`);
  });
}
