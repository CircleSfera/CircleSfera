import { expect, type Page, test } from '@playwright/test';
import { FIXTURES, prepareComposerSession } from './helpers/composer';

/**
 * A photo story keeps its photo in the picture that is shared, in a real
 * browser on a phone (390×844), with the network stubbed. The picture is
 * read back pixel by pixel: Safari once drew the photo blank on the first
 * render of the export, and the story went out black with only its text.
 * CI runs it in Chromium; run it with a WebKit project to check Safari.
 */
test.use({ viewport: { width: 390, height: 844 } });

/**
 * The picture of the story, as it is handed to the upload. It is kept in the
 * page: not every browser gives the test a file sent in a form.
 */
async function recordUploadedPicture(page: Page) {
  await page.addInitScript(() => {
    const kept: Blob[] = [];
    (window as unknown as { storyPictures: Blob[] }).storyPictures = kept;
    const append = FormData.prototype.append as (
      this: FormData,
      ...args: [string, string | Blob, string?]
    ) => void;
    FormData.prototype.append = function (
      this: FormData,
      name: string,
      value: string | Blob,
      fileName?: string,
    ) {
      if (value instanceof Blob && value.type === 'image/png') kept.push(value);
      if (fileName === undefined) append.call(this, name, value);
      else append.call(this, name, value, fileName);
    };
  });
  await page.route('**/api/v1/uploads', (route) =>
    route.fulfill({
      status: 201,
      json: { url: 'https://cdn.example.com/uploads/story.png', type: 'image' },
    }),
  );
  let shared = 0;
  await page.route('**/api/v1/stories', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    shared += 1;
    await route.fulfill({ status: 201, json: { id: 'story-e2e' } });
  });
  return { shared: () => shared };
}

/**
 * The share of the uploaded picture's pixels that are lit (not nearly black),
 * and the share that are the red of the pen.
 */
function shares(page: Page) {
  return page.evaluate(async () => {
    const [picture] = (window as unknown as { storyPictures: Blob[] })
      .storyPictures;
    const bitmap = await createImageBitmap(picture);
    const canvas = document.createElement('canvas');
    canvas.width = 90;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let lit = 0;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      if (r + g + b > 60) lit += 1;
      if (r > 200 && g < 90 && b < 90) red += 1;
    }
    const all = data.length / 4;
    return { lit: lit / all, red: red / all };
  });
}

test('a photo story with text is shared with its photo behind the text, not on black', async ({
  page,
}) => {
  await prepareComposerSession(page);
  const sent = await recordUploadedPicture(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.postImage);
  await expect(page.getByRole('button', { name: 'Texto' })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Texto' }).click();
  await page.keyboard.type('Hola');
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(sent.shared, { timeout: 15_000 }).toBe(1);
  // The photo fills the story: nearly all of it is lit.
  expect((await shares(page)).lit).toBeGreaterThan(0.9);
});

test('a drawing on a story is shared in its picture', async ({ page }) => {
  await prepareComposerSession(page);
  const sent = await recordUploadedPicture(page);
  await page.goto('/create?mode=story');
  await page
    .getByRole('button', { name: 'Crear Historia de Texto' })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  await page.getByRole('button', { name: 'Rojo' }).click();
  const box = await page.getByTestId('story-drawing').boundingBox();
  if (!box) throw new Error('no drawing area');
  for (const y of [120, 160, 200]) {
    await page.mouse.move(box.x + 60, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + y, { steps: 12 });
    await page.mouse.up();
  }
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();

  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();

  await expect.poll(sent.shared, { timeout: 15_000 }).toBe(1);
  expect((await shares(page)).red).toBeGreaterThan(0.005);
});
