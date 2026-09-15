import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import BottomNav from './BottomNav';

describe('BottomNav', () => {
  it('labels the landmark and destinations from the catalog', () => {
    const { i18n } = renderWithProviders(<BottomNav />);

    expect(
      screen.getByRole('navigation', { name: i18n!.t('nav.mobile') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.home') }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.search') }),
    ).toHaveAttribute('href', '/explore');
    expect(
      screen.getByRole('link', { name: i18n!.t('nav.frames') }),
    ).toHaveAttribute('href', '/frames');
  });
});
