import { act, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { OfflineIndicator } from './OfflineIndicator';

describe('OfflineIndicator', () => {
  it('shows catalog copy when the browser goes offline', () => {
    const { i18n } = renderWithProviders(<OfflineIndicator />);

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(i18n!.t('common.offline')).toBe('No internet connection');
    expect(screen.getByText(i18n!.t('common.offline'))).toBeInTheDocument();
    expect(
      screen.queryByText('Sin conexión a internet'),
    ).not.toBeInTheDocument();
  });

  it('uses Spanish catalog copy offline', () => {
    const { i18n } = renderWithProviders(<OfflineIndicator />, { lng: 'es' });

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(i18n!.t('common.offline')).toBe('Sin conexión a internet');
    expect(screen.getByText(i18n!.t('common.offline'))).toBeInTheDocument();
  });
});
