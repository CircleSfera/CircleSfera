import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * A live with guests, on a stubbed server: the host chooses guests in the
 * setup, goes live, and the guests are invited and shown as chips, on a
 * phone and on a computer.
 */
const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };

async function stubServer(page: Page) {
  const invited: string[] = [];
  await page.route('**/api/v1/profiles/*', (route) => {
    const username = route.request().url().split('/').pop() ?? '';
    return route.fulfill({
      json: { id: `p-${username}`, username, avatar: null },
    });
  });
  await page.route('**/api/v1/live/start', (route) =>
    route.fulfill({ json: { token: 'test-token', stream: { id: 'live-1' } } }),
  );
  await page.route('**/api/v1/live/live-1/guests', (route) => {
    invited.push(route.request().postDataJSON().profileId);
    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/v1/live/live-1', (route) =>
    route.fulfill({
      json: {
        id: 'live-1',
        status: 'LIVE',
        guests: invited.map((profileId, i) => ({
          profileId,
          username: profileId.replace('p-', ''),
          avatar: null,
          status: i === 0 ? 'ON_AIR' : 'INVITED',
        })),
      },
    }),
  );
  await page.routeWebSocket(/livekit/, () => {});
  await page.route(/livekit\.(cloud|e2e\.invalid)/, () => {});
  return invited;
}

async function invite(page: Page, username: string) {
  await page
    .getByRole('button', { name: 'Invitar', exact: true })
    .first()
    .click();
  await page.getByRole('textbox', { name: 'Nombre de usuario' }).fill(username);
  await page.getByRole('button', { name: 'Enviar invitación' }).click();
  await expect(page.getByText(`@${username}`)).toBeVisible();
}

test('the host chooses guests in the setup and sees them invited on air', async ({
  page,
}, info) => {
  await page.setViewportSize(PHONE);
  await prepareComposerSession(page);
  const invited = await stubServer(page);
  await page.goto('/live/broadcast');

  await invite(page, 'ana');
  await invite(page, 'luis');
  await expect(page.getByText('Se invitará al empezar')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('setup-390.png') });
  await page.setViewportSize(COMPUTER);
  await page.screenshot({ path: info.outputPath('setup-1280.png') });
  await page.setViewportSize(PHONE);

  await page.getByRole('button', { name: 'Emitir en directo' }).click();
  await expect(
    page.getByRole('button', { name: 'Terminar el directo' }),
  ).toBeVisible();
  await expect.poll(() => invited).toEqual(['p-ana', 'p-luis']);
  await expect(page.getByText('En directo', { exact: true })).toBeVisible();
  await expect(page.getByText('Invitado', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('on-air-390.png') });
  await page.setViewportSize(COMPUTER);
  await page.screenshot({ path: info.outputPath('on-air-1280.png') });
});
