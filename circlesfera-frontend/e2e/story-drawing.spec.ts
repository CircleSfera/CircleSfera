import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * Drawing on a story, in a real browser on a phone (390×844), with the real
 * drawing canvas: each brush leaves its own mark, the eraser rubs out what it
 * passes over and nothing else, and undo brings it back.
 */
test.use({ viewport: { width: 390, height: 844 } });

/** The colour of the drawing at a point of the canvas, in CSS pixels. */
async function pixel(page: Page, x: number, y: number) {
  return page.evaluate(
    ([px, py]) => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '[data-testid="story-drawing"] canvas.lower-canvas',
      );
      if (!canvas) throw new Error('no drawing canvas');
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      const [r, g, b, a] = canvas
        .getContext('2d')
        ?.getImageData(Math.round(px * scale), Math.round(py * scale), 1, 1)
        .data ?? [0, 0, 0, 0];
      return { r, g, b, a };
    },
    [x, y],
  );
}

/** A straight stroke across the canvas at a height, as a finger draws it. */
async function stroke(page: Page, y: number) {
  const box = await page.getByTestId('story-drawing').boundingBox();
  if (!box) throw new Error('no drawing area');
  await page.mouse.move(box.x + 60, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + y, { steps: 12 });
  await page.mouse.up();
  return { x: 160, y };
}

/**
 * Chooses the eraser and measures the drawing area again: the eraser hides
 * the colours, so the panel is shorter and the story moves.
 */
async function chooseEraser(page: Page) {
  await page.getByRole('button', { name: 'Goma' }).click();
  await expect(page.getByText('Color', { exact: true })).toHaveCount(0);
  const box = await page.getByTestId('story-drawing').boundingBox();
  if (!box) throw new Error('no drawing area');
  return box;
}

/** Waits until the drawing at a point, as rendered, meets a condition. */
async function until(
  page: Page,
  at: { x: number; y: number },
  check: (px: { r: number; g: number; b: number; a: number }) => boolean,
) {
  await expect
    .poll(async () => check(await pixel(page, at.x, at.y)))
    .toBe(true);
}

/** Opens a text story and its drawing tools. */
async function openDrawing(page: Page) {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page
    .getByRole('button', { name: 'Crear Historia de Texto' })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();
  const box = await page.getByTestId('story-drawing').boundingBox();
  if (!box) throw new Error('no drawing area');
  return box;
}

test('each brush leaves its mark, the eraser rubs out what it passes over, and undo brings it back', async ({
  page,
}) => {
  await openDrawing(page);

  await page.getByRole('button', { name: 'Rojo' }).click();
  const pen = await stroke(page, 120);
  await until(page, pen, (px) => px.a === 255);
  const red = await pixel(page, pen.x, pen.y);
  expect(red.r).toBeGreaterThan(200);
  expect(red.g).toBeLessThan(90);
  expect(red.a).toBe(255);

  await page.getByRole('button', { name: 'Rotulador' }).click();
  const marker = await stroke(page, 220);
  await until(page, marker, (px) => px.a > 0);
  const half = await pixel(page, marker.x, marker.y);
  expect(half.a).toBeGreaterThan(90);
  expect(half.a).toBeLessThan(170);

  await page.getByRole('button', { name: 'Neón' }).click();
  await page.getByRole('button', { name: 'Verde' }).click();
  const neon = await stroke(page, 320);
  await until(page, neon, (px) => px.a > 0);
  const core = await pixel(page, neon.x, neon.y);
  expect(core.r).toBeGreaterThan(200);
  expect(core.b).toBeGreaterThan(200);
  // The glow, just outside the stroke, is green.
  const glow = await pixel(page, neon.x, neon.y + 7);
  expect(glow.g).toBeGreaterThan(glow.r);
  expect(glow.a).toBeGreaterThan(0);

  const box = await chooseEraser(page);
  // Across the middle of the pen's stroke only.
  await page.mouse.move(box.x + pen.x, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + pen.x, box.y + 140, { steps: 8 });
  await page.mouse.up();
  await until(page, pen, (px) => px.a === 0);
  // The rest of the stroke stays, and so does the marker.
  expect((await pixel(page, 230, pen.y)).r).toBeGreaterThan(200);
  expect((await pixel(page, marker.x, marker.y)).a).toBeGreaterThan(90);

  await page.getByRole('button', { name: 'Deshacer' }).last().click();
  await until(page, pen, (px) => px.r > 200 && px.a === 255);
});

test('the eraser rubs out a stroke it jumps over, or passes within its width of', async ({
  page,
}) => {
  await openDrawing(page);
  await page.getByRole('button', { name: 'Rojo' }).click();
  const first = await stroke(page, 120);
  const second = await stroke(page, 300);
  await until(page, second, (px) => px.a === 255);

  const area = await chooseEraser(page);
  // One move from well above the first stroke to well below it: no pointer
  // position the browser reports lies on the stroke.
  await page.mouse.move(area.x + 100, area.y + 60);
  await page.mouse.down();
  await page.mouse.move(area.x + 100, area.y + 180, { steps: 1 });
  await page.mouse.up();
  await until(page, { x: 100, y: first.y }, (px) => px.a === 0);
  expect((await pixel(page, 220, first.y)).a).toBe(255);

  // A wide eraser drawn beside the second stroke, never on it.
  await page.getByRole('slider').fill('40');
  await page.mouse.move(area.x + 100, area.y + 285);
  await page.mouse.down();
  await page.mouse.move(area.x + 140, area.y + 285, { steps: 4 });
  await page.mouse.up();
  await until(page, { x: 120, y: second.y }, (px) => px.a === 0);
  expect((await pixel(page, 220, second.y)).a).toBe(255);
});

test('a neon stroke keeps its glow where it was not rubbed out', async ({
  page,
}) => {
  await openDrawing(page);
  await page.getByRole('button', { name: 'Neón' }).click();
  await page.getByRole('button', { name: 'Verde' }).click();
  const neon = await stroke(page, 200);
  await until(page, { x: neon.x, y: neon.y + 7 }, (px) => px.a > 0);
  const before = await pixel(page, neon.x, neon.y + 7);

  const area = await chooseEraser(page);
  await page.mouse.move(area.x + 70, area.y + 180);
  await page.mouse.down();
  await page.mouse.move(area.x + 70, area.y + 220, { steps: 6 });
  await page.mouse.up();
  await until(page, { x: 70, y: neon.y }, (px) => px.a === 0);

  const after = await pixel(page, neon.x, neon.y + 7);
  expect(after.g).toBeGreaterThan(after.r);
  expect(after.a).toBeGreaterThan(before.a / 2);
});

test('undo puts erased strokes back in the order they were drawn', async ({
  page,
}) => {
  await openDrawing(page);
  // Red, then green across it at the same height: green lies on top.
  await page.getByRole('button', { name: 'Rojo' }).click();
  const under = await stroke(page, 200);
  await page.getByRole('button', { name: 'Verde' }).click();
  await stroke(page, 200);
  await until(page, under, (px) => px.g > px.r);

  const area = await chooseEraser(page);
  await page.mouse.move(area.x + 160, area.y + 180);
  await page.mouse.down();
  await page.mouse.move(area.x + 160, area.y + 220, { steps: 6 });
  await page.mouse.up();
  await until(page, under, (px) => px.a === 0);

  await page.getByRole('button', { name: 'Deshacer' }).last().click();
  await until(page, under, (px) => px.a === 255 && px.g > px.r);
});
