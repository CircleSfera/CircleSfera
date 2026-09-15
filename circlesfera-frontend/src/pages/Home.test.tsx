import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Home from './Home';

vi.mock('../components/common/SEO', () => ({
  default: () => null,
}));

vi.mock('../components/StoryList', () => ({
  default: () => null,
}));

vi.mock('../components/suggestions/SuggestionsList', () => ({
  SuggestionsList: () => null,
}));

vi.mock('../components/PostCard', () => ({
  default: () => null,
}));

vi.mock('../services', () => ({
  feedApi: {
    getForYou: vi.fn(),
    getFollowing: vi.fn(),
  },
}));

import { feedApi } from '../services';

function emptyFeed() {
  return {
    data: {
      data: [],
      meta: { page: 1, totalPages: 0, total: 0, limit: 10 },
    },
  } as never;
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(feedApi.getForYou).mockResolvedValue(emptyFeed());
    vi.mocked(feedApi.getFollowing).mockResolvedValue(emptyFeed());
  });

  it('shows For You / Following from the catalog, not Spanish fallbacks', async () => {
    const { i18n } = renderWithProviders(<Home />);

    expect(i18n!.t('feed.for_you')).toBe('For You');
    expect(i18n!.t('feed.following')).toBe('Following');
    expect(
      screen.getByRole('button', { name: i18n!.t('feed.for_you') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('feed.following') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Para ti' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Siguiendo' }),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(feedApi.getForYou).toHaveBeenCalled();
    });
  });

  it('uses Spanish catalog labels', () => {
    const { i18n } = renderWithProviders(<Home />, { lng: 'es' });

    expect(i18n!.t('feed.for_you')).toBe('Para ti');
    expect(
      screen.getByRole('button', { name: i18n!.t('feed.for_you') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('feed.following') }),
    ).toBeInTheDocument();
  });
});
