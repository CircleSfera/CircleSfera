import { expect, type Locator, type Page, test } from '@playwright/test';
import { FIXTURES, prepareComposerSession } from './helpers/composer';

/**
 * The photo behind a story, edited with nothing selected, in a real browser
 * on a phone (390×844): one finger moves it, two scale and turn it, a quick
 * sideways swipe changes its filter, a tap still opens a text, and the
 * picture that is shared shows it as the screen does, read back pixel by
 * pixel. CI runs it in Chromium; run it with a WebKit project to check
 * Safari, which once drew a photo blank in the export.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** Keeps the shared picture in the page and answers the upload. */
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
  await page.route('**/api/v1/stories', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({ status: 201, json: { id: 'story-e2e' } });
  });
}

async function storyWithPhoto(page: Page) {
  await prepareComposerSession(page);
  await recordUploadedPicture(page);
  await page.goto('/create?mode=story');
  await page.locator('input[type="file"]').setInputFiles(FIXTURES.postImage);
  const photo = page.getByTestId('story-photo');
  await expect(photo).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => photo.evaluate((img) => (img as HTMLImageElement).complete))
    .toBe(true);
  return photo;
}

/** The transform and filter the photo is drawn with. */
const drawn = (photo: Locator) =>
  photo.evaluate((img) => {
    const { transform, filter } = (img as HTMLElement).style;
    return {
      transform,
      filter,
      x: Number(/translate\(([-\d.]+)%/.exec(transform)?.[1] ?? 0),
      scale: Number(/scale\(([-\d.]+)\)/.exec(transform)?.[1] ?? 1),
      rotation: Number(/rotate\(([-\d.]+)deg\)/.exec(transform)?.[1] ?? 0),
    };
  });

async function canvasBox(page: Page) {
  const box = await page.getByTestId('story-canvas').boundingBox();
  if (!box) throw new Error('Not on screen');
  return box;
}

/** Pointer events of a touch screen: `id` tells one finger from another. */
async function finger(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  id: number,
  at: { x: number; y: number },
) {
  await page.evaluate(
    ({ type, id, at }) => {
      const target =
        type === 'pointerdown'
          ? document.elementFromPoint(at.x, at.y)
          : document.body;
      target?.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: id,
          pointerType: 'touch',
          isPrimary: id === 1,
          clientX: at.x,
          clientY: at.y,
        }),
      );
    },
    { type, id, at },
  );
}

/** Two fingers about a point: spread `spread` times and turned `deg`. */
async function pinch(
  page: Page,
  c: { x: number; y: number },
  spread: number,
  deg: number,
) {
  const at = (r: number, a: number, sign: 1 | -1) => ({
    x: c.x + sign * r * Math.cos(a),
    y: c.y + sign * r * Math.sin(a),
  });
  await finger(page, 'pointerdown', 1, at(60, 0, -1));
  await finger(page, 'pointerdown', 2, at(60, 0, 1));
  for (const part of [0.25, 0.5, 0.75, 1]) {
    const r = 60 * (1 + (spread - 1) * part);
    const a = ((deg * Math.PI) / 180) * part;
    await finger(page, 'pointermove', 1, at(r, a, -1));
    await finger(page, 'pointermove', 2, at(r, a, 1));
  }
  const r = 60 * spread;
  const a = (deg * Math.PI) / 180;
  await finger(page, 'pointerup', 2, at(r, a, 1));
  await finger(page, 'pointerup', 1, at(r, a, -1));
}

test('one finger moves the photo, two scale and turn it, each one undo step', async ({
  page,
}) => {
  const photo = await storyWithPhoto(page);
  const box = await canvasBox(page);
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  // A slow drag down and to the right.
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(c.x + 3 * i, c.y + 8 * i);
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  const moved = await drawn(photo);
  expect(moved.x).toBeCloseTo((30 / box.width) * 100, 0);
  expect(moved.filter).toBe('');
  // A drag is not a tap: no text opens.
  await expect(page.getByTestId('story-text-mode')).toHaveCount(0);

  await pinch(page, c, 2, 30);
  const turned = await drawn(photo);
  expect(turned.scale).toBeCloseTo(2, 1);
  expect(turned.rotation).toBeCloseTo(30, 0);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(() => drawn(photo)).toEqual(moved);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(async () => (await drawn(photo)).transform).toBe('');
});

test('a quick sideways swipe changes the filter and names it; a tap still opens a text', async ({
  page,
}) => {
  const photo = await storyWithPhoto(page);
  const box = await canvasBox(page);
  const y = box.y + box.height / 2;

  await page.mouse.move(box.x + 300, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, y + 4, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByTestId('story-filter-name')).toHaveText('Clarendon');
  await expect(
    page.getByRole('status').filter({ hasText: 'Filtro:' }),
  ).toHaveText('Filtro: Clarendon');
  const swiped = await drawn(photo);
  expect(swiped.filter).toContain('contrast(125%)');
  // The swipe put the photo back where it was.
  expect(swiped.transform).toBe('');
  await expect(page.getByTestId('story-filter-name')).toHaveCount(0);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(async () => (await drawn(photo)).filter).toBe('');

  await page.mouse.click(box.x + 200, box.y + 600);
  await expect(page.getByTestId('story-text-mode')).toBeVisible();
});

test('Ctrl with the wheel scales the photo when nothing is selected', async ({
  page,
}) => {
  const photo = await storyWithPhoto(page);
  const box = await canvasBox(page);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -60);
  await page.keyboard.up('Control');

  await expect
    .poll(async () => (await drawn(photo)).scale)
    .toBeGreaterThan(1.5);
});

/**
 * The mean difference, from 0 to 255 per channel, between the shared
 * picture and the canvas as it was on screen, both brought to 45 × 80; and
 * the share of the picture's pixels that are coloured or near black.
 */
function compareWithScreen(page: Page, screen: string) {
  return page.evaluate(async (screenBase64) => {
    const [picture] = (window as unknown as { storyPictures: Blob[] })
      .storyPictures;
    const shot = await (
      await fetch(`data:image/png;base64,${screenBase64}`)
    ).blob();
    const read = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = 45;
      canvas.height = 80;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D context');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const [a, b] = [await read(picture), await read(shot)];
    let diff = 0;
    let coloured = 0;
    let dark = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let k = 0; k < 3; k++) diff += Math.abs(a[i + k] - b[i + k]);
      const [r, g, bl] = [a[i], a[i + 1], a[i + 2]];
      if (Math.max(r, g, bl) - Math.min(r, g, bl) > 24) coloured += 1;
      if (r + g + bl < 30) dark += 1;
    }
    const pixels = a.length / 4;
    return {
      diff: diff / (pixels * 3),
      coloured: coloured / pixels,
      dark: dark / pixels,
    };
  }, screen);
}

test('the shared picture shows the photo where the screen does: placed, scaled, turned and filtered', async ({
  page,
}) => {
  const photo = await storyWithPhoto(page);
  const box = await canvasBox(page);
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

  await pinch(page, c, 1.5, 20);
  const canvas = page.getByRole('application', {
    name: /Foto de la historia/,
  });
  await canvas.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  // Moon: black and white.
  for (let i = 0; i < 3; i++) await page.keyboard.press(']');
  await expect(page.getByTestId('story-filter-name')).toHaveText('Moon');
  await expect(page.getByTestId('story-filter-name')).toHaveCount(0);
  const shown = await drawn(photo);
  expect(shown.rotation).toBeCloseTo(20, 0);
  expect(shown.filter).toContain('grayscale(100%)');

  // The canvas alone, without the controls laid over it.
  const hide = await page.addStyleTag({
    content:
      'body * { visibility: hidden !important; } [data-testid="story-canvas"], [data-testid="story-canvas"] * { visibility: visible !important; }',
  });
  const screen = (
    await page
      .getByTestId('story-canvas')
      .screenshot({ animations: 'disabled' })
  ).toString('base64');
  await hide.evaluate((node) => (node as Element).remove());

  await page.getByRole('button', { name: 'Tu historia', exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { storyPictures: Blob[] }).storyPictures
              .length,
        ),
      { timeout: 15_000 },
    )
    .toBe(1);

  const read = await compareWithScreen(page, screen);
  test.info().annotations.push({
    type: 'pixels',
    description: JSON.stringify(read),
  });
  // Black and white, as the filter makes it on screen.
  expect(read.coloured).toBeLessThan(0.01);
  // Moved right and turned: the left edge shows the black behind it.
  expect(read.dark).toBeGreaterThan(0.02);
  // And pixel by pixel what the screen showed.
  expect(read.diff).toBeLessThan(8);
});
