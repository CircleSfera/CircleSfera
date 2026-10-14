import { expect, test } from '@playwright/test';
import {
  FIXTURES,
  openComposer,
  prepareComposerSession,
  uploadFixture,
  waitEditPreviewReady,
} from './helpers/composer';

/**
 * The photo editor of the composer opens again on what was chosen: the
 * filter and the adjustments of a photo are still there, and saving again
 * does not lose them.
 */
test.use({ viewport: { width: 390, height: 844 } });

test('the photo editor opens again with the filter and adjustment it had', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await openComposer(page, 'post');
  await uploadFixture(page, FIXTURES.postImage);
  await waitEditPreviewReady(page, '4:5');

  const tools = page.getByRole('toolbar', { name: /Editar Medio/i });
  await tools.getByRole('button', { name: 'Filtros' }).click();
  await page.getByRole('button', { name: 'Moon' }).click();
  await page.getByRole('tab', { name: 'Ajustar' }).click();
  await page.getByRole('slider').first().fill('140');
  await page.getByRole('button', { name: 'Listo' }).click();
  await waitEditPreviewReady(page, '4:5');

  await tools.getByRole('button', { name: 'Filtros' }).click();
  await expect(page.getByRole('button', { name: 'Moon' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('tab', { name: 'Ajustar' }).click();
  await expect(page.getByRole('slider').first()).toHaveValue('140');
});

test('a filter from the row of the edit step is the one the editor opens on', async ({
  page,
}) => {
  await prepareComposerSession(page);
  await openComposer(page, 'post');
  await uploadFixture(page, FIXTURES.postImage);
  await waitEditPreviewReady(page, '4:5');

  const row = page.getByRole('group', { name: 'Filtros' });
  await row.getByRole('button', { name: 'Moon' }).click();
  await expect(row.getByRole('button', { name: 'Moon' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page
    .getByRole('toolbar', { name: /Editar Medio/i })
    .getByRole('button', { name: 'Ajustar' })
    .click();
  await page.getByRole('tab', { name: 'Filtros' }).click();
  await expect(page.getByRole('button', { name: 'Moon' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
