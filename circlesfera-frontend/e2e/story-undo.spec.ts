import { expect, type Locator, type Page, test } from '@playwright/test';
import { prepareComposerSession } from './helpers/composer';

/**
 * Undo in the story composer, in a real browser on a phone (390×844).
 *
 * A change to an element is one undo step per finished gesture. This runs in
 * a browser because the order in which a browser delivers the end of a
 * gesture and the next tap is what once broke redo, and the component tests
 * cannot reproduce it.
 */
test.use({ viewport: { width: 390, height: 844 } });

async function storyWithSticker(page: Page) {
  await prepareComposerSession(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();
  await page.getByRole('button', { name: 'Stickers', exact: true }).click();
  await page.getByRole('button', { name: '🔥', exact: true }).click();
  await expect(page.getByTestId('story-element')).toHaveCount(1);
  // Let the sticker settle where it was added.
  await page.waitForTimeout(600);
}

const undo = (page: Page) => page.getByRole('button', { name: 'Deshacer' });
const redo = (page: Page) => page.getByRole('button', { name: 'Rehacer' });

async function centre(element: Locator) {
  const box = await element.boundingBox();
  if (!box) throw new Error('The element is not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

async function drag(page: Page, element: Locator, dx: number, dy: number) {
  const from = await centre(element);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Several moves, as a finger does: all of them are one gesture.
  for (const part of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(from.x + dx * part, from.y + dy * part, { steps: 4 });
  }
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test('a sticker dragged on the story goes back in one undo, and redo moves it again', async ({
  page,
}) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const start = await centre(sticker);

  await drag(page, sticker, 70, -110);
  const moved = await centre(sticker);
  expect(distance(moved, start)).toBeGreaterThan(40);

  await undo(page).click();
  await expect
    .poll(async () => distance(await centre(sticker), start))
    .toBeLessThan(4);
  await expect(redo(page)).toBeEnabled();

  await redo(page).click();
  await expect
    .poll(async () => distance(await centre(sticker), moved))
    .toBeLessThan(4);
});

test('each drag is its own step, and the last undo removes the sticker', async ({
  page,
}) => {
  await storyWithSticker(page);
  const sticker = page.getByTestId('story-element');
  const start = await centre(sticker);

  await drag(page, sticker, 70, -110);
  const first = await centre(sticker);
  await drag(page, sticker, -60, 30);

  await undo(page).click();
  await expect
    .poll(async () => distance(await centre(sticker), first))
    .toBeLessThan(4);
  await undo(page).click();
  await expect
    .poll(async () => distance(await centre(sticker), start))
    .toBeLessThan(4);

  await undo(page).click();
  await expect(sticker).toHaveCount(0);
  await expect(undo(page)).toBeDisabled();
});

test('a slider dragged in the element editor is one undo step, a key press another', async ({
  page,
}) => {
  await storyWithSticker(page);
  await page.getByRole('button', { name: 'Transformar', exact: true }).click();
  const rotation = page.getByRole('slider', { name: 'Rotación' });
  await rotation.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  await drag(page, rotation, 60, 0);
  const dragged = await rotation.inputValue();
  expect(Number(dragged)).not.toBe(0);

  await undo(page).click();
  await expect(rotation).toHaveValue('0');
  await redo(page).click();
  await expect(rotation).toHaveValue(dragged);
  await expect(redo(page)).toBeDisabled();

  await rotation.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const afterKeys = Number(await rotation.inputValue());

  await undo(page).click();
  await expect(rotation).toHaveValue(String(afterKeys - 1));
  await undo(page).click();
  await expect(rotation).toHaveValue(dragged);
});
