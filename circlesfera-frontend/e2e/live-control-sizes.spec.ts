import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import { undersizedControls } from './helpers/control-sizes';

/**
 * Control sizes and names across the live screens on a phone (390×844):
 * going live and watching a live.
 *
 * The API is answered inside the browser and the video connection is held
 * open without a server, so the screens stay as they are while they are
 * measured. Nothing is broadcast.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function expectScreenInOrder(page: Page) {
  expect(await undersizedControls(page)).toEqual([]);

  // Every visible control says what it is.
  const unnamed = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, input:not([type=hidden]), textarea',
      ),
    )
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 1 && box.height > 1;
      })
      .filter(
        (element) =>
          !(
            element.getAttribute('aria-label') ||
            element.textContent?.trim() ||
            (element as HTMLInputElement).labels?.length
          ),
      )
      .map(
        (element) =>
          `${element.tagName.toLowerCase()} "${element.getAttribute('placeholder') ?? ''}"`,
      ),
  );
  expect(unnamed).toEqual([]);
}

async function holdVideoConnection(page: Page) {
  await page.routeWebSocket(/livekit/, () => {});
  await page.route(/livekit\.cloud/, () => {});
}

async function goLive(page: Page) {
  await prepareComposerSession(page);
  await page.route('**/api/v1/live/start', (route) =>
    route.fulfill({
      status: 200,
      json: { token: 'test-token', stream: { id: 'stream-1' } },
    }),
  );
  await page.route('**/api/v1/live/end', (route) =>
    route.fulfill({ status: 200, json: {} }),
  );
  await holdVideoConnection(page);
  await page.goto('/live/broadcast');
}

async function startBroadcast(page: Page) {
  await goLive(page);
  await page.getByRole('button', { name: 'Empezar a emitir' }).click();
  await expect(
    page.getByRole('button', { name: 'Terminar transmisión' }),
  ).toBeVisible();
}

async function watchLive(page: Page) {
  await prepareComposerSession(page);
  await page.route('**/api/v1/live/**', (route) =>
    route.fulfill({
      status: 200,
      json: {
        token: 'test-token',
        title: 'Directo de prueba',
        host: { profile: { username: 'ana', avatar: null } },
      },
    }),
  );
  await holdVideoConnection(page);
  await page.goto('/live/stream-1');
  await expect(page.getByRole('button', { name: 'Regalar' })).toBeVisible();
}

test.describe('Going live', () => {
  test('setup screen', async ({ page }) => {
    await goLive(page);
    await expectScreenInOrder(page);
  });

  test('on air', async ({ page }) => {
    await startBroadcast(page);
    await expectScreenInOrder(page);
  });

  test('inviting a co-host', async ({ page }) => {
    await startBroadcast(page);
    await page
      .getByRole('button', { name: 'Invitar a un co-anfitrión' })
      .click();
    await expectScreenInOrder(page);
  });

  test('setting the goal', async ({ page }) => {
    await startBroadcast(page);
    await page.getByRole('button', { name: 'Añadir Objetivo' }).click();
    await expectScreenInOrder(page);
  });

  test('questions panel', async ({ page }) => {
    await startBroadcast(page);
    await page.getByRole('button', { name: 'Q&A' }).click();
    await expectScreenInOrder(page);
  });

  test('ending asks first, then shows the summary', async ({ page }) => {
    await startBroadcast(page);
    await page.getByRole('button', { name: 'Terminar transmisión' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('¿Terminar el directo?')).toBeVisible();
    await expectScreenInOrder(page);

    await dialog.getByRole('button', { name: 'Terminar transmisión' }).click();
    await expect(
      page.getByRole('heading', { name: 'Live Finalizado' }),
    ).toBeVisible();
    await expectScreenInOrder(page);
  });
});

test.describe('Watching a live', () => {
  test('the live', async ({ page }) => {
    await watchLive(page);
    await expectScreenInOrder(page);
  });

  test('the comment field keeps its width next to the reactions', async ({
    page,
  }) => {
    await watchLive(page);
    const field = page.getByRole('textbox', {
      name: 'Escribe un comentario...',
    });
    const box = await field.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(200);

    await field.fill('Hola a todos');
    await expect(
      page.getByRole('button', { name: 'Enviar comentario' }),
    ).toBeVisible();
    await expectScreenInOrder(page);
  });

  test('gifts', async ({ page }) => {
    await watchLive(page);
    await page.getByRole('button', { name: 'Regalar' }).click();
    await expectScreenInOrder(page);
  });

  test('questions panel', async ({ page }) => {
    await watchLive(page);
    await page.getByRole('button', { name: 'Q&A' }).click();
    await expectScreenInOrder(page);
  });
});
