import { expect, type Locator, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * The fingers on the story canvas, in a real browser on a phone (390×844):
 * two fingers scale and turn a piece, a piece dropped on the bin goes, and on
 * desktop Ctrl with the wheel (a trackpad pinch) scales it. Two fingers are
 * sent as pointer events with their own ids, as a touch screen sends them.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function storyWithSticker(page: Page) {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: '🔥', exact: true }).click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);
  // Close the stickers panel so the canvas keeps its size.
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.waitForTimeout(500);
}

async function centre(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('Not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The scale and angle the piece is drawn with. */
const drawn = (sticker: Locator) =>
  sticker.evaluate((node) => {
    const t = (node as HTMLElement).style.transform;
    return {
      scale: Number(/scale\(([-\d.]+)\)/.exec(t)?.[1]),
      rotation: Number(/rotate\(([-\d.]+)deg\)/.exec(t)?.[1]),
    };
  });

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

test('two fingers scale and turn a piece, and one undo puts it back', async ({
  page,
}) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const c = await centre(sticker);
  const before = await drawn(sticker);

  // One finger on the sticker, the other on the canvas beside it.
  const a0 = { x: c.x, y: c.y };
  const b0 = { x: c.x + 80, y: c.y };
  await finger(page, 'pointerdown', 1, a0);
  await finger(page, 'pointerdown', 2, b0);
  // Spread to twice the distance and turn a quarter.
  for (const part of [0.25, 0.5, 0.75, 1]) {
    const angle = (Math.PI / 2) * part;
    const spread = 80 * (1 + part);
    await finger(page, 'pointermove', 2, {
      x: a0.x + spread * Math.cos(angle),
      y: a0.y + spread * Math.sin(angle),
    });
  }
  await finger(page, 'pointerup', 2, a0);
  await finger(page, 'pointerup', 1, a0);

  const after = await drawn(sticker);
  expect(after.scale).toBeCloseTo(before.scale * 2, 1);
  expect(after.rotation).toBeCloseTo(90, 0);

  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect.poll(() => drawn(sticker)).toEqual(before);
});

test('a piece dropped on the bin goes, and undo brings it back', async ({
  page,
}) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const from = await centre(sticker);
  const canvas = await page
    .getByTestId('story-element')
    .evaluate(
      (node) =>
        (node.parentElement as HTMLElement)
          .getBoundingClientRect()
          .toJSON() as DOMRect,
    );
  // The bin sits at the bottom middle of the canvas.
  const bin = {
    x: canvas.x + canvas.width / 2,
    y: canvas.y + canvas.height - 24 - 28,
  };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(
      from.x + (bin.x - from.x) * part,
      from.y + (bin.y - from.y) * part,
      { steps: 3 },
    );
  }
  await expect(page.getByTestId('story-bin')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.mouse.up();

  await expect(page.getByTestId('story-element')).toHaveCount(0);
  await expect(page.getByTestId('story-bin')).toHaveCount(0);
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);
});

test('a piece dragged elsewhere stays, and the bin only shows while dragging', async ({
  page,
}) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const from = await centre(sticker);
  await expect(page.getByTestId('story-bin')).toHaveCount(0);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y - 120, { steps: 6 });
  await expect(page.getByTestId('story-bin')).toHaveAttribute(
    'data-active',
    'false',
  );
  await page.mouse.up();

  await expect(sticker).toHaveCount(1);
  await expect(page.getByTestId('story-bin')).toHaveCount(0);
});

test('Ctrl with the wheel scales the selected piece', async ({ page }) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const c = await centre(sticker);
  await sticker.click();
  const before = await drawn(sticker);

  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -60);
  await page.keyboard.up('Control');

  await expect
    .poll(async () => (await drawn(sticker)).scale)
    .toBeGreaterThan(before.scale * 1.5);
});

test('a tap on an empty part of the canvas lets the selected piece go', async ({
  page,
}) => {
  await storyWithSticker(page);
  await page.getByTestId('story-element').click();
  await expect(page.getByRole('button', { name: 'Estilo' })).toBeVisible();
  const c = await centre(page.getByTestId('story-element'));

  // Under the layer of the controls, which lets the touch through.
  await page.mouse.click(c.x - 120, c.y + 160);

  await expect(page.getByRole('button', { name: 'Estilo' })).toHaveCount(0);
});
