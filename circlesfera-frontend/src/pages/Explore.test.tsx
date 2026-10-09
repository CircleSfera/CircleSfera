import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Explore from './Explore';

vi.mock('../components/common/SEO', () => ({
  default: () => null,
}));

vi.mock('../services', () => ({
  feedApi: {
    getForYou: vi.fn(),
  },
  postsApi: {
    getAll: vi.fn(),
  },
  searchApi: {
    getHistory: vi.fn().mockResolvedValue({ data: [] }),
    clearHistory: vi.fn(),
    search: vi.fn(),
  },
}));

import { feedApi, searchApi } from '../services';

describe('Explore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders discovery tiles linking to post detail, not PostCards', async () => {
    vi.mocked(feedApi.getForYou).mockResolvedValue({
      data: {
        data: [
          {
            id: 'explore-post-1',
            caption: 'Sunset',
            media: [
              {
                id: 'm1',
                url: 'https://cdn.example/a.jpg',
                type: 'image',
                order: 0,
              },
            ],
            type: 'POST',
            _count: { likes: 3, comments: 1 },
          },
        ],
        meta: { page: 1, totalPages: 1, total: 1, limit: 20 },
      },
    } as never);

    renderWithProviders(<Explore />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Sunset/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /Sunset/i })).toHaveAttribute(
      'href',
      '/p/explore-post-1',
    );
    expect(screen.getByTestId('explore-search-input')).toBeInTheDocument();
    expect(document.querySelector('[data-post-card]')).toBeNull();
  });

  it('searches people with a badge only when the switch is on', async () => {
    vi.mocked(feedApi.getForYou).mockResolvedValue({
      data: { data: [], meta: { page: 1, totalPages: 1, total: 0, limit: 20 } },
    } as never);
    vi.mocked(searchApi.search).mockResolvedValue({
      data: {
        users: [],
        hashtags: [],
        semanticPosts: [],
        semanticProfiles: [],
      },
    } as never);

    const { i18n } = renderWithProviders(<Explore />);
    fireEvent.change(screen.getByTestId('explore-search-input'), {
      target: { value: 'ana' },
    });

    const toggle = await screen.findByRole('button', {
      name: i18n!.t('explore.verified_only'),
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(searchApi.search).toHaveBeenLastCalledWith('ana', false);

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(searchApi.search).toHaveBeenLastCalledWith('ana', true);
    });
    // The results are drawn again with the new answer.
    expect(
      await screen.findByRole('button', {
        name: i18n!.t('explore.verified_only'),
      }),
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
