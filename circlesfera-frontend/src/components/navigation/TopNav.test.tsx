import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import TopNav from './TopNav';

describe('TopNav', () => {
  it('labels home, notifications, and messages from the catalog', () => {
    const { i18n } = renderWithProviders(<TopNav />);

    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.notifications') }),
    ).toHaveAttribute('href', '/activity');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.messages') }),
    ).toHaveAttribute('href', '/direct/inbox');
    expect(screen.queryByRole('link', { name: 'Notificaciones' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'Mensajes directos' }),
    ).toBeNull();
  });

  it('uses Spanish catalog labels', () => {
    const { i18n } = renderWithProviders(<TopNav />, { lng: 'es' });

    expect(i18n!.t('nav.notifications')).toBe('Notificaciones');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.notifications') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.messages') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toBeInTheDocument();
  });
});
