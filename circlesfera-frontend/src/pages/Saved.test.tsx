import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Saved from './Saved';

vi.mock('../components/common/SEO', () => ({
  default: () => null,
}));

vi.mock('../services', () => ({
  bookmarksApi: {
    getAll: vi.fn(),
  },
}));

import { bookmarksApi } from '../services';

describe('Saved', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bookmarksApi.getAll).mockResolvedValue({
      data: { data: [], meta: { page: 1, totalPages: 0, total: 0, limit: 50 } },
    } as never);
  });

  it('labels the back control from the catalog', async () => {
    const { i18n } = renderWithProviders(<Saved />);

    expect(
      screen.getByRole('link', { name: i18n!.t('common.back_home') }),
    ).toHaveAttribute('href', '/');
    expect(
      screen.queryByRole('link', { name: 'Volver al inicio' }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(bookmarksApi.getAll).toHaveBeenCalled();
    });
  });

  it('uses the Spanish back label', () => {
    const { i18n } = renderWithProviders(<Saved />, { lng: 'es' });

    expect(i18n!.t('common.back_home')).toBe('Volver al inicio');
    expect(
      screen.getByRole('link', { name: i18n!.t('common.back_home') }),
    ).toBeInTheDocument();
  });
});
