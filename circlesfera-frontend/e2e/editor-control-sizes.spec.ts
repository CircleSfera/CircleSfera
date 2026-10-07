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

/**
 * Control sizes across the content editor on a phone (390×844).
 *
 * Every button and control must offer at least 44 px in both directions and
 * every text field at least 48 px in height. Each test opens one screen of
 * the editor and measures what is on it.
 */
test.use({ viewport: { width: 390, height: 844 } });

const MIN_CONTROL = 44;
const MIN_TEXT_FIELD = 48;

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

/** Visible controls on the screen that are under the minimum size. */
async function undersizedControls(page: Page): Promise<string[]> {
  // Let entry animations finish; a control measured mid-animation is smaller.
  await page.waitForTimeout(900);
  return page.evaluate(
    ({ minControl, minTextField }) =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="tab"], input:not([type=file]):not([type=checkbox]), textarea',
        ),
      )
        .map((element) => ({ element, box: element.getBoundingClientRect() }))
        .filter(
          ({ box }) =>
            box.width > 1 &&
            box.height > 1 &&
            box.top < window.innerHeight &&
            box.bottom > 0 &&
            box.left < window.innerWidth &&
            box.right > 0,
        )
        .filter(({ element, box }) => {
          const isTextField =
            element.tagName === 'TEXTAREA' ||
            (element.tagName === 'INPUT' &&
              !['range', 'color'].includes((element as HTMLInputElement).type));
          return isTextField
            ? box.height < minTextField - 0.5
            : box.height < minControl - 0.5 || box.width < minControl - 0.5;
        })
        .map(({ element, box }) => {
          const name = (
            element.getAttribute('aria-label') ||
            element.textContent ||
            element.getAttribute('placeholder') ||
            ''
          )
            .trim()
            .slice(0, 30);
          return `${element.tagName.toLowerCase()} ${Math.round(box.width)}x${Math.round(box.height)} "${name}"`;
        }),
    { minControl: MIN_CONTROL, minTextField: MIN_TEXT_FIELD },
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
      await page
        .getByTestId('edit-preview-frame')
        .getByRole('button', { name: /Editar Medio/i })
        .click();
      await page.getByRole('tab', { name: new RegExp(tab, 'i') }).click();
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
