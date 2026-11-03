import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';
import {
  createScenarioUser,
  prepareAuthenticatedSession,
  testProfile,
} from './helpers/session';

/**
 * Scheduled lives on a stubbed server: the host schedules one from the live
 * setup, and a viewer asks to be reminded of one from the host's Profile,
 * on a phone and on a computer.
 */
const PHONE = { width: 390, height: 844 };
const COMPUTER = { width: 1280, height: 800 };
const SCHEDULED = /\/api\/v1\/live\/scheduled(\?|$)/;
const DAY = 24 * 60 * 60 * 1000;

const upcoming = (over: Record<string, unknown> = {}) => ({
  id: '0b6b7c0e-5b0a-4c1e-9f57-0d1c3b2a4e51',
  hostId: 'p-host',
  title: 'Charla del domingo: preguntas y respuestas',
  audience: 'EVERYONE',
  startsAt: new Date(Date.now() + 3 * DAY).toISOString(),
  status: 'SCHEDULED',
  reminded: false,
  ...over,
});

// Each picture is taken once the sheets have finished sliding in.
async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // A spinner never ends, and an animation taken away never finishes.
        .filter(
          (animation) =>
            animation.effect?.getComputedTiming().iterations !== Infinity,
        )
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

async function shoot(page: Page, path: string) {
  await page.setViewportSize(PHONE);
  await settled(page);
  await page.screenshot({ path: `${path}-390.png` });
  await page.setViewportSize(COMPUTER);
  await settled(page);
  await page.screenshot({ path: `${path}-1280.png` });
  await page.setViewportSize(PHONE);
}

test('the host schedules a live from the setup', async ({ page }, info) => {
  await page.setViewportSize(PHONE);
  await prepareComposerSession(page);
  const sent: Record<string, unknown>[] = [];
  await page.route(SCHEDULED, (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      sent.push(body);
      return route.fulfill({
        status: 201,
        json: upcoming({ ...body, reminderCount: 0 }),
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.routeWebSocket(/livekit/, () => {});
  await page.route(/livekit\.(cloud|e2e\.invalid)/, () => {});
  // The setup is opened from inside the app, which it goes back to once
  // scheduled.
  await page.goto('/');
  await page.evaluate(() => {
    window.history.pushState({}, '', '/live/broadcast');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });

  await page
    .getByRole('textbox', { name: 'Título del directo' })
    .fill('Charla del domingo');
  await page.getByRole('button', { name: 'Mejores amigos' }).click();
  await page.getByRole('button', { name: 'Programar', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Programar un directo' });
  await expect(sheet.getByLabel('Fecha y hora')).toBeVisible();
  await expect(
    sheet.getByText('«Charla del domingo», para tus mejores amigos.', {
      exact: false,
    }),
  ).toBeVisible();
  await shoot(page, info.outputPath('schedule-sheet'));

  await sheet.getByRole('button', { name: 'Programar directo' }).click();
  await expect(page.getByText(/^Directo programado: /)).toBeVisible();
  await expect(page).not.toHaveURL(/\/live\/broadcast/);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    title: 'Charla del domingo',
    audience: 'CLOSE_FRIENDS',
  });
  const startsAt = new Date(sent[0].startsAt as string).getTime();
  expect(startsAt).toBeGreaterThan(Date.now());
});

test('the host sees their upcoming lives on the setup, each to start or cancel', async ({
  page,
}, info) => {
  await page.setViewportSize(PHONE);
  await prepareComposerSession(page);
  await page.route(SCHEDULED, (route) =>
    route.fulfill({
      json: [
        upcoming({ reminderCount: 4 }),
        upcoming({
          id: '1c7c8d1f-6c1b-4d2f-8a68-1e2d4c3b5f62',
          title: 'Ensayo de la banda',
          audience: 'CLOSE_FRIENDS',
          startsAt: new Date(Date.now() + 10 * DAY).toISOString(),
          reminderCount: 1,
        }),
      ],
    }),
  );
  await page.routeWebSocket(/livekit/, () => {});
  await page.route(/livekit\.(cloud|e2e\.invalid)/, () => {});
  await page.goto('/live/broadcast');

  await page.getByRole('button', { name: '2 directos programados' }).click();
  const sheet = page.getByRole('dialog', { name: 'Tus próximos directos' });
  await expect(
    sheet.getByRole('button', { name: 'Empezar ahora' }),
  ).toHaveCount(2);
  await expect(sheet.getByRole('button', { name: 'Cancelar' })).toHaveCount(2);
  await expect(
    sheet.getByText('4 personas pidieron que les avisemos'),
  ).toBeVisible();
  await shoot(page, info.outputPath('upcoming-sheet'));
});

test('a viewer asks to be reminded from the host Profile', async ({
  page,
}, info) => {
  await page.setViewportSize(PHONE);
  await prepareAuthenticatedSession(page, { scenario: 'viewer' });
  const host = createScenarioUser({ scenario: 'host', username: 'anahost' });
  const hostProfile = testProfile({ id: 'p-host' }, host);
  const reminders: string[] = [];
  await page.route('**/api/v1/profiles/anahost', (route) =>
    route.fulfill({ json: hostProfile }),
  );
  await page.route(SCHEDULED, (route) => {
    expect(new URL(route.request().url()).searchParams.get('profileId')).toBe(
      hostProfile.id,
    );
    return route.fulfill({ json: [upcoming({ hostId: hostProfile.id })] });
  });
  await page.route('**/api/v1/live/scheduled/*/reminder', (route) => {
    reminders.push(route.request().method());
    return route.fulfill({
      status: route.request().method() === 'POST' ? 201 : 200,
      json: { reminded: route.request().method() === 'POST' },
    });
  });
  await page.goto('/anahost');

  const card = page
    .getByRole('region', { name: 'Próximos directos' })
    .getByRole('listitem');
  await expect(card).toHaveCount(1);
  await expect(
    card.getByText('Charla del domingo: preguntas y respuestas'),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Recordarme' }).click();
  await expect(
    card.getByRole('button', { name: 'Recordatorio activado' }),
  ).toBeVisible();
  expect(reminders).toEqual(['POST']);
  await shoot(page, info.outputPath('profile-reminded'));

  await card.getByRole('button', { name: 'Recordatorio activado' }).click();
  await expect(card.getByRole('button', { name: 'Recordarme' })).toBeVisible();
  expect(reminders).toEqual(['POST', 'DELETE']);
});

test('the host sees the reminders of their own upcoming live on their Profile', async ({
  page,
}, info) => {
  await page.setViewportSize(PHONE);
  const { user, profile } = await prepareAuthenticatedSession(page, {
    scenario: 'host',
  });
  await page.route(`**/api/v1/profiles/${user.username}`, (route) =>
    route.fulfill({ json: profile }),
  );
  await page.route(SCHEDULED, (route) =>
    route.fulfill({
      json: [upcoming({ hostId: profile.id, reminderCount: 12 })],
    }),
  );
  await page.goto(`/${user.username}`);

  const card = page
    .getByRole('region', { name: 'Próximos directos' })
    .getByRole('listitem');
  await expect(
    card.getByText('12 personas pidieron que les avisemos'),
  ).toBeVisible();
  await expect(card.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Recordarme' })).toHaveCount(0);
  await shoot(page, info.outputPath('profile-host'));
});
