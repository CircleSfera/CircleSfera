import { expect, type Page, test } from '@playwright/test';
import {
  confirmFrameTrim,
  FIXTURES,
  goToCaption,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';
import { undersizedControls } from './helpers/control-sizes';

/**
 * Control sizes across the content editor on a phone (390×844).
 *
 * Every button and control must offer at least 44 px in both directions and
 * every text field at least 48 px in height. Each test opens one screen of
 * the editor and measures what is on it.
 */
test.use({ viewport: { width: 390, height: 844 } });

const AUDIO = [1, 2, 3].map((n) => ({
  id: `audio-${n}`,
  title: `Canción ${n}`,
  artist: `Artista ${n}`,
  url: 'https://cdn.example.com/audio.mp3',
  duration: 30,
  thumbnailUrl: null,
  usageCount: n * 10,
}));

async function prepare(page: Page) {
  await prepareComposerSession(page);
  await page.route('**/api/v1/audio/**', (route) =>
    route.fulfill({ status: 200, json: AUDIO }),
  );
}

async function expectControlsAtSize(page: Page) {
  expect(await undersizedControls(page)).toEqual([]);
}

async function postAtEditStep(page: Page) {
  await prepare(page);
  await openComposer(page, 'post');
  await uploadFixture(page, FIXTURES.postImage);
  await waitEditPreviewReady(page, '4:5');
}

async function openStoryComposer(page: Page) {
  await prepare(page);
  await page.goto('/create?mode=story');
  await page.getByRole('button', { name: /Crear Historia de Texto/ }).click();
  await expect(
    page.getByRole('button', { name: 'Fondo', exact: true }),
  ).toBeVisible();
}

test.describe('Post composer', () => {
  test('upload step', async ({ page }) => {
    await prepare(page);
    await openComposer(page, 'post');
    await expectControlsAtSize(page);
  });

  test('edit step', async ({ page }) => {
    await postAtEditStep(page);
    await expectControlsAtSize(page);
  });

  test('caption step', async ({ page }) => {
    await postAtEditStep(page);
    await goToCaption(page);
    await expectControlsAtSize(page);
  });

  for (const row of [
    'Añadir Ubicación',
    'Etiquetar Personas',
    'Añadir Música',
    'Añadir encuesta o preguntas',
    'Monetización',
    'Accesibilidad',
    'Ajustes Avanzados',
  ]) {
    test(`sub-screen: ${row}`, async ({ page }) => {
      await postAtEditStep(page);
      await goToCaption(page);
      await page.getByRole('button', { name: row }).first().click();
      await expectControlsAtSize(page);
    });
  }

  test('tag people, with search results', async ({ page }) => {
    await postAtEditStep(page);
    await page.route('**/api/v1/search/**', (route) =>
      route.fulfill({
        status: 200,
        json: [
          { id: 'p1', username: 'ana.garcia', fullName: 'Ana García' },
          { id: 'p2', username: 'anabel', fullName: null },
        ],
      }),
    );
    await goToCaption(page);
    await page
      .getByRole('button', { name: 'Etiquetar Personas' })
      .first()
      .click();
    await page
      .locator('img.cursor-crosshair')
      .click({ position: { x: 150, y: 150 }, force: true });
    await page.getByPlaceholder('Buscar usuario...').fill('ana');
    await expect(page.getByText('ana.garcia')).toBeVisible();
    await expectControlsAtSize(page);
  });

  test('music, when it cannot load', async ({ page }) => {
    await postAtEditStep(page);
    await goToCaption(page);
    await page.route('**/api/v1/audio/**', (route) =>
      route.fulfill({ status: 500, json: {} }),
    );
    await page.getByRole('button', { name: 'Añadir Música' }).first().click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 });
    await expectControlsAtSize(page);
  });

  test('music trim', async ({ page }) => {
    await postAtEditStep(page);
    await goToCaption(page);
    await page.getByRole('button', { name: 'Añadir Música' }).first().click();
    await page.getByRole('button', { name: 'Usar' }).first().click();
    await expectControlsAtSize(page);
  });
});

test.describe('Photo editor', () => {
  for (const tab of ['Filtros', 'Ajustar', 'Recorte', 'Capa']) {
    test(`tab: ${tab}`, async ({ page }) => {
      await postAtEditStep(page);
      // The tools of the edit step open the editor on their own tab.
      await page
        .getByRole('toolbar', { name: /Editar Medio/i })
        .getByRole('button', { name: new RegExp(tab, 'i') })
        .click();
      await expect(
        page.getByRole('tab', { name: new RegExp(tab, 'i') }),
      ).toHaveAttribute('aria-selected', 'true');
      await expectControlsAtSize(page);
    });
  }
});

test.describe('Frame composer', () => {
  test('upload step', async ({ page }) => {
    await prepare(page);
    await openComposer(page, 'frame');
    await expectControlsAtSize(page);
  });

  test('trim, edit and caption steps', async ({ page }) => {
    await prepare(page);
    await openComposer(page, 'frame');
    await uploadFixture(page, FIXTURES.frameVideo);
    await page
      .getByRole('button', { name: /^Listo$/ })
      .first()
      .waitFor({ state: 'visible', timeout: 20_000 });
    await expectControlsAtSize(page);

    await confirmFrameTrim(page);
    await expectControlsAtSize(page);

    await goToCaption(page);
    await expectControlsAtSize(page);
  });
});

test.describe('Story composer', () => {
  test('entry screen', async ({ page }) => {
    await prepare(page);
    await page.goto('/create?mode=story');
    await expect(
      page.getByRole('button', { name: /Crear Historia de Texto/ }),
    ).toBeVisible();
    await expectControlsAtSize(page);
  });

  test('composer', async ({ page }) => {
    await openStoryComposer(page);
    await expectControlsAtSize(page);
  });

  for (const tool of [
    'Fondo',
    'Texto',
    'Stickers',
    'Plantillas',
    'Dibujar',
    'Más',
  ]) {
    test(`tool: ${tool}`, async ({ page }) => {
      await openStoryComposer(page);
      await page.getByRole('button', { name: tool, exact: true }).click();
      await expectControlsAtSize(page);
    });
  }
});

test.describe('Story composer, editing an element', () => {
  async function withSticker(page: Page) {
    await openStoryComposer(page);
    await page.getByRole('button', { name: 'Stickers', exact: true }).click();
    await page.getByRole('button', { name: '🔥', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Estilo', exact: true }),
    ).toBeVisible();
  }

  for (const section of ['Estilo', 'Transformar', 'Capas']) {
    test(`section: ${section}`, async ({ page }) => {
      await withSticker(page);
      await page.getByRole('button', { name: section, exact: true }).click();
      await expectControlsAtSize(page);
    });
  }

  for (const item of ['Encuesta', 'Preguntas']) {
    test(`more: ${item}`, async ({ page }) => {
      await openStoryComposer(page);
      await page.getByRole('button', { name: 'Más', exact: true }).click();
      await page.getByRole('menuitem', { name: item }).click();
      await expectControlsAtSize(page);
    });
  }

  test('text mode, with the type options open', async ({ page }) => {
    await openStoryComposer(page);
    await page.getByRole('button', { name: 'Texto', exact: true }).click();
    await page.getByRole('button', { name: 'Opciones de tipo' }).click();
    await expectControlsAtSize(page);
  });
});

test.describe('Edits studio', () => {
  test('main screen, with track controls folded and open', async ({ page }) => {
    await prepare(page);
    await page.goto('/edits');
    await expect(page.getByRole('button', { name: 'Exportar' })).toBeVisible();
    await expectControlsAtSize(page);

    await page
      .getByRole('button', { name: 'Opciones de la pista' })
      .first()
      .click();
    await expectControlsAtSize(page);

    // Nothing may make the page wider than the screen.
    const width = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(width).toBeLessThanOrEqual(390);
  });
});
