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

test('a text story with a poll is shared from its editor, with the poll where it was placed and not in its picture', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();

  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: 'Encuesta', exact: true }).click();
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

  // Shared from the editor itself, with no step after it.
  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads).toEqual(['image/png']);
  expect(sent.stories[0]).toMatchObject({
    mediaType: 'image',
    isCloseFriendsOnly: false,
  });
  // The poll goes with the story, as one of its stickers, where it sits.
  const [created] = sent.stories[0].stickers as {
    kind: string;
    settings: { question: string };
    x: number;
    y: number;
  }[];
  expect(created).toMatchObject({
    kind: 'POLL',
    settings: { question: '¿Playa o montaña?' },
  });
  expect(Math.abs(created.x)).toBeLessThan(0.05);
  expect(created.y).toBeLessThan(-0.1);
  expect(sent.polls).toEqual([]);
});

test('a video story opens in the editor and is shared as its video, with what is painted on it as a layer', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.frameVideo);

  // The editor plays the video as the background, out of the picture.
  const video = page.locator('video[data-export-ignore="true"]');
  await expect(video).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: '🔥', exact: true }).first().click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  // The video as it is, then the painted layer.
  expect(sent.uploads).toEqual(['video/mp4', 'image/png']);
  expect(sent.stories[0]).toMatchObject({
    mediaType: 'video',
    url: 'https://cdn.example.com/uploads/story.mp4',
    overlayUrl: 'https://cdn.example.com/uploads/story.png',
  });
});

test('a video story with nothing painted on it is shared as its video alone', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordPublishing(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.frameVideo);
  await expect(page.locator('video[data-export-ignore="true"]')).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(() => sent.stories.length, { timeout: 15_000 }).toBe(1);
  expect(sent.uploads).toEqual(['video/mp4']);
  expect(sent.stories[0]).toMatchObject({ mediaType: 'video' });
  expect(sent.stories[0]).not.toHaveProperty('overlayUrl');
});

test('choosing music opens over the editor and keeps what is on the story', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await page.route('**/api/v1/audio/**', (route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: 'audio-1',
          title: 'Canción 1',
          artist: 'Artista 1',
          url: 'https://cdn.example.com/audio.mp3',
          duration: 30,
          thumbnailUrl: null,
          usageCount: 1,
        },
      ],
    }),
  );
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: '🔥', exact: true }).click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);

  await page
    .getByRole('button', { name: 'Añadir música', exact: true })
    .click();
  await page.getByRole('button', { name: 'Usar' }).first().click();
  await page.getByRole('button', { name: 'Usar este clip' }).click();

  await expect(page.getByTestId('story-element')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Añadir música: Canción 1' }),
  ).toBeVisible();
});
