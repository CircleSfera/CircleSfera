import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../stores/authStore';
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
    getFavorites: vi.fn(),
  },
}));

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
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
    vi.mocked(feedApi.getFavorites).mockResolvedValue(emptyFeed());
    useAuthStore.setState({ isAuthenticated: false });
  });

  it('takes no room for suggestions when there is no one to suggest, so the feed stays centred', () => {
    const { container } = renderWithProviders(<Home />);
    const aside = container.querySelector('aside');
    expect(aside).toBeEmptyDOMElement();
    expect(aside).toHaveClass('lg:empty:hidden');
  });

  it('offers Favorites only to someone signed in', () => {
    renderWithProviders(<Home />);
    expect(
      screen.queryByRole('button', { name: 'Favorites' }),
    ).not.toBeInTheDocument();
  });

  it('reads the Favorites feed and points to choosing Favorites when it is empty', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    renderWithProviders(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Favorites' }));

    await waitFor(() => expect(feedApi.getFavorites).toHaveBeenCalledWith(1));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Choose Favorites' }),
    );
    expect(navigate).toHaveBeenCalledWith('/accounts/favorites');
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
