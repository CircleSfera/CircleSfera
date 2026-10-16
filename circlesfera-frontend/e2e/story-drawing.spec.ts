import { expect, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * Drawing on a story, in a real browser on a phone (390×844), with the real
 * drawing canvas: each brush leaves its own mark, the eraser takes a stroke
 * off whole, and undo brings it back.
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
  await page.waitForTimeout(150);
  return { x: 160, y };
}

test('each brush leaves its mark, the eraser takes a stroke off whole, and undo brings it back', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page
    .getByRole('button', { name: 'Crear Historia de Texto' })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dibujar', exact: true }).click();

  await page.getByRole('button', { name: 'Rojo' }).click();
  const pen = await stroke(page, 120);
  const red = await pixel(page, pen.x, pen.y);
  expect(red.r).toBeGreaterThan(200);
  expect(red.g).toBeLessThan(90);
  expect(red.a).toBe(255);

  await page.getByRole('button', { name: 'Rotulador' }).click();
  const marker = await stroke(page, 220);
  const half = await pixel(page, marker.x, marker.y);
  expect(half.a).toBeGreaterThan(90);
  expect(half.a).toBeLessThan(170);

  await page.getByRole('button', { name: 'Neón' }).click();
  await page.getByRole('button', { name: 'Verde' }).click();
  const neon = await stroke(page, 320);
  const core = await pixel(page, neon.x, neon.y);
  expect(core.r).toBeGreaterThan(200);
  expect(core.b).toBeGreaterThan(200);
  // The glow, just outside the stroke, is green.
  const glow = await pixel(page, neon.x, neon.y + 7);
  expect(glow.g).toBeGreaterThan(glow.r);
  expect(glow.a).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Goma' }).click();
  await expect(page.getByText('Color', { exact: true })).toHaveCount(0);
  const box = await page.getByTestId('story-drawing').boundingBox();
  if (!box) throw new Error('no drawing area');
  // Across the pen's stroke only, at one end of it.
  await page.mouse.move(box.x + 70, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 140, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect((await pixel(page, pen.x, pen.y)).a).toBe(0);
  expect((await pixel(page, marker.x, marker.y)).a).toBeGreaterThan(90);

  await page.getByRole('button', { name: 'Deshacer' }).last().click();
  await page.waitForTimeout(150);
  expect((await pixel(page, pen.x, pen.y)).r).toBeGreaterThan(200);
});
