import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import NotFound from './NotFound';

vi.mock('../components/common/SEO', () => ({
  default: () => null,
}));

describe('NotFound', () => {
  it('shows catalog copy, not hardcoded English', () => {
    const { i18n } = renderWithProviders(<NotFound />);

    expect(
      screen.getByRole('heading', { name: i18n!.t('notFound.title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('notFound.description')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('common.back_home') }),
    ).toHaveAttribute('href', '/');
    expect(i18n!.t('notFound.title')).toBe('Page not found');
  });

  it('uses Spanish catalog copy', () => {
    const { i18n } = renderWithProviders(<NotFound />, { lng: 'es' });

    expect(i18n!.t('notFound.title')).toBe('Página no encontrada');
    expect(
      screen.getByRole('heading', { name: i18n!.t('notFound.title') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Page not found' }),
    ).not.toBeInTheDocument();
  });
});
