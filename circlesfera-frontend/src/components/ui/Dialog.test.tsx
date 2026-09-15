import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('labels the close control from the catalog', () => {
    const { i18n } = renderWithProviders(
      <Dialog isOpen title="Account" onClose={vi.fn()}>
        Body
      </Dialog>,
    );

    expect(
      screen.getByRole('button', { name: i18n!.t('common.close_dialog') }),
    ).toBeInTheDocument();
    expect(i18n!.t('common.close_dialog')).toBe('Close dialog');
  });

  it('uses the Spanish close label', () => {
    const { i18n } = renderWithProviders(
      <Dialog isOpen title="Cuenta" onClose={vi.fn()}>
        Cuerpo
      </Dialog>,
      { lng: 'es' },
    );

    expect(i18n!.t('common.close_dialog')).toBe('Cerrar diálogo');
    expect(
      screen.getByRole('button', { name: i18n!.t('common.close_dialog') }),
    ).toBeInTheDocument();
  });
});
