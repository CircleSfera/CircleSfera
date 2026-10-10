import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../services/api';
import { renderWithProviders } from '../../test/test-utils';
import { SuggestedArticles } from './SuggestedArticles';

vi.mock('../../services/api', () => ({ apiClient: { get: vi.fn() } }));

const found = ['one', 'two', 'three', 'four'].map((slug) => ({
  slug,
  topic: 'OTHER',
  title: `Article ${slug}`,
}));

describe('SuggestedArticles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers up to three matching articles, opened in another tab', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { locale: 'en', articles: found },
    });
    renderWithProviders(<SuggestedArticles subject="  payment  " />);

    const first = await screen.findByRole('link', { name: 'Article one' });
    expect(first).toHaveAttribute('href', '/help/one');
    expect(first).toHaveAttribute('target', '_blank');
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(apiClient.get).toHaveBeenCalledWith('/help/articles', {
      params: { locale: 'en', q: 'payment' },
    });
  });

  it('asks nothing for a subject of fewer than four characters', async () => {
    const { container } = renderWithProviders(
      <SuggestedArticles subject="pay" />,
    );
    await new Promise((done) => setTimeout(done, 50));
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when nothing matches or the help centre does not answer', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { locale: 'en', articles: [] },
    });
    const { container, unmount } = renderWithProviders(
      <SuggestedArticles subject="zebra" />,
    );
    await waitFor(() => expect(apiClient.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('down'));
    const again = renderWithProviders(<SuggestedArticles subject="zebras" />);
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledTimes(2));
    expect(again.container).toBeEmptyDOMElement();
  });
});
