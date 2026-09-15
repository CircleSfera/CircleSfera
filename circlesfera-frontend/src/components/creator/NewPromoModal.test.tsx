import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import NewPromoModal from './NewPromoModal';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPosts: vi.fn(),
    createPromotion: vi.fn(),
  },
}));

const post: CreatorPost = {
  id: 'post-1',
  caption: 'Sunset reel',
  type: 'POST',
  views: 10,
  performanceScore: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  _count: { likes: 0, comments: 0, bookmarks: 0 },
};

const frame: CreatorPost = {
  ...post,
  id: 'frame-1',
  caption: 'Night frame',
  type: 'FRAME',
};

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_promo';

describe('NewPromoModal', () => {
  const onClose = vi.fn();
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [post] },
    } as never);
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: { url: checkoutUrl },
    } as never);
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'http://localhost/creator/ads' },
    });
  });

  it('shows the empty state and closes without creating', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [] },
    } as never);

    const { i18n } = renderWithProviders(
      <NewPromoModal onClose={onClose} onToast={onToast} />,
    );

    expect(
      await screen.findByText(i18n!.t('creator.promotions.no_posts')),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('creates a post promo with the default daily budget and duration', async () => {
    const { i18n } = renderWithProviders(
      <NewPromoModal onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(await screen.findByText('Sunset reel'));
    expect(
      screen.getByText(i18n!.t('creator.promotions.configure_reach')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 35,
        }),
      }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 35,
        }),
      }),
    );

    await waitFor(() => {
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'post',
        targetId: 'post-1',
        dailyBudget: 5,
        durationDays: 7,
        currency: 'EUR',
        objective: 'PROFILE_VISITS',
        countries: undefined,
        interests: undefined,
      });
    });
    expect(onToast).toHaveBeenCalledWith(
      i18n!.t('creator.promotions.redirecting'),
      'success',
    );
    expect(window.location.href).toBe(checkoutUrl);
  });

  it('sends frame as the target type', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [frame] },
    } as never);

    const { i18n } = renderWithProviders(
      <NewPromoModal onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(await screen.findByText('Night frame'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 35,
        }),
      }),
    );

    await waitFor(() => {
      expect(creatorApi.createPromotion).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'frame',
          targetId: 'frame-1',
        }),
      );
    });
  });

  it('sends the chosen budget, duration and trimmed targeting', async () => {
    const { i18n } = renderWithProviders(
      <NewPromoModal onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(await screen.findByText('Sunset reel'));
    fireEvent.click(screen.getByRole('button', { name: '€10' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.days', { count: 3 }),
      }),
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('creator.promotions.countries_placeholder'),
      ),
      { target: { value: '  ES,PT  ' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        i18n!.t('creator.promotions.interests_placeholder'),
      ),
      { target: { value: '  music  ' } },
    );
    fireEvent.change(
      screen.getByDisplayValue(i18n!.t('creator.promotions.objective_profile')),
      {
        target: { value: 'FOLLOWS' },
      },
    );

    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 30,
        }),
      }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 30,
        }),
      }),
    );

    await waitFor(() => {
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'post',
        targetId: 'post-1',
        dailyBudget: 10,
        durationDays: 3,
        currency: 'EUR',
        objective: 'FOLLOWS',
        countries: 'ES,PT',
        interests: 'music',
      });
    });
  });

  it('toasts when checkout has no url', async () => {
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: {},
    } as never);

    const { i18n } = renderWithProviders(
      <NewPromoModal onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(await screen.findByText('Sunset reel'));
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 35,
        }),
      }),
    );

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('creator.promotions.error_create'),
        'error',
      );
    });
    expect(window.location.href).toBe('http://localhost/creator/ads');
  });
});
