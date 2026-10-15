import { expect, type Page, test } from '@playwright/test';
import { FIXTURES, prepareComposerSession } from './helpers/composer';

/**
 * Creating a story from start to share, in a real browser on a phone
 * (390×844), with the network stubbed. It guards what the story redesign must
 * keep: the picture that is uploaded, the story that is created and the poll
 * that is answered where it was placed.
 */
test.use({ viewport: { width: 390, height: 844 } });

interface Sent {
  /** The type of each file uploaded, as the form says it. */
  uploads: string[];
  stories: Record<string, unknown>[];
  polls: Record<string, unknown>[];
}

async function recordPublishing(page: Page): Promise<Sent> {
  const sent: Sent = { uploads: [], stories: [], polls: [] };
  await page.route('**/api/v1/uploads', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    const type = /Content-Type: ([\w/+.-]+)/.exec(body)?.[1] ?? 'unknown';
    sent.uploads.push(type);
    await route.fulfill({
      status: 201,
      json: {
        url: `https://cdn.example.com/uploads/story.${type.startsWith('video') ? 'mp4' : 'png'}`,
        type: type.startsWith('video') ? 'video' : 'image',
      },
    });
  });
  await page.route('**/api/v1/stories', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    sent.stories.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { id: 'story-e2e' } });
  });
  await page.route('**/api/v1/interactive/poll', async (route) => {
    sent.polls.push(route.request().postDataJSON());
    await route.fulfill({ status: 201, json: { id: 'poll-e2e' } });
  });
  return sent;
}

/** The share button of the last step of a story. */
async function share(page: Page) {
  await page
    .locator('header')
    .getByRole('button', { name: 'Compartir', exact: true })
    .click();
}

test('a text story with a poll is shared with the poll where it was placed, not in its picture', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();

  await page.getByRole('button', { name: 'Más', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Encuesta' }).click();
  await page.getByPlaceholder('Escribe tu pregunta…').fill('¿Playa o montaña?');
  await page.getByRole('button', { name: 'Añadir encuesta' }).click();
  const poll = page.getByTestId('story-element');
  await expect(poll).toHaveAttribute('data-export-ignore', 'true');
  await page.waitForTimeout(500);

  // Move it up, as a finger does.
  const box = await poll.boundingBox();
  if (!box) throw new Error('The poll is not on screen');
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(from.x, from.y - 100 * part, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(400);

  await page.getByRole('button', { name: /Listo/ }).first().click();
  await share(page);

  await expect.poll(() => sent.polls.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads).toEqual(['image/png']);
  expect(sent.stories).toHaveLength(1);
  expect(sent.stories[0]).toMatchObject({ mediaType: 'image' });
  const [created] = sent.polls;
  expect(created).toMatchObject({
    question: '¿Playa o montaña?',
    storyId: 'story-e2e',
  });
  const placement = created.placement as { x: number; y: number };
  expect(Math.abs(placement.x)).toBeLessThan(0.05);
  expect(placement.y).toBeLessThan(-0.1);
});

test('a video story is shared as a video', async ({ page }) => {
  // A video does not open the story editor today: the edit step offers it
  // only for pictures, so text, stickers and polls cannot go on a video yet.
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.frameVideo);
  await expect(
    page.getByRole('button', { name: /Editar Historia/ }),
  ).toHaveCount(0);

  await share(page);

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads).toEqual(['video/mp4']);
  expect(sent.stories[0]).toMatchObject({ mediaType: 'video' });
});
