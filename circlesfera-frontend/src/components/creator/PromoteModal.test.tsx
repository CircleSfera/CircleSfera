import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import PromoteModal from './PromoteModal';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
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
  _count: { likes: 4, comments: 2, bookmarks: 0 },
};

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_boost';

describe('PromoteModal', () => {
  const onClose = vi.fn();
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: { url: checkoutUrl },
    } as never);
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'http://localhost/p/post-1' },
    });
  });

  it('closes from the dialog X without creating', () => {
    const { i18n } = renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    expect(screen.getByText(i18n!.t('post.menu.promote'))).toBeInTheDocument();
    expect(screen.getByText('Sunset reel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('creates with the default 5 EUR for 3 days and empty targeting strings', async () => {
    const { i18n } = renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 15,
        }),
      }),
    );

    await waitFor(() => {
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'post',
        targetId: 'post-1',
        dailyBudget: 5,
        durationDays: 3,
        currency: 'EUR',
        objective: 'PROFILE_VISITS',
        countries: '',
        interests: '',
      });
    });
    expect(onToast).toHaveBeenCalledWith(
      i18n!.t('creator.promotions.redirecting'),
      'success',
    );
    expect(window.location.href).toBe(checkoutUrl);
  });

  it('lowercases FRAME to frame', async () => {
    const { i18n } = renderWithProviders(
      <PromoteModal
        post={{ ...post, id: 'frame-1', type: 'FRAME' }}
        onClose={onClose}
        onToast={onToast}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 15,
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

  it('sends the edited budget, duration, objective and trimmed targeting', async () => {
    const { i18n } = renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.objective_follows'),
      }),
    );
    fireEvent.change(
      screen.getByLabelText(
        i18n!.t('creator.promotions.daily_budget', { currency: 'EUR' }),
      ),
      {
        target: { value: '10' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('creator.promotions.campaign_duration')),
      {
        target: { value: '7' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('creator.promotions.countries_hint')),
      {
        target: { value: '  ES,PT  ' },
      },
    );
    fireEvent.change(
      screen.getByLabelText(i18n!.t('creator.promotions.interests_hint')),
      {
        target: { value: '  music  ' },
      },
    );

    expect(screen.getByText('€70')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 70,
        }),
      }),
    );

    await waitFor(() => {
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'post',
        targetId: 'post-1',
        dailyBudget: 10,
        durationDays: 7,
        currency: 'EUR',
        objective: 'FOLLOWS',
        countries: 'ES,PT',
        interests: 'music',
      });
    });
  });

  it('disables boost when the total is not positive', () => {
    const { i18n } = renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.change(
      screen.getByLabelText(
        i18n!.t('creator.promotions.daily_budget', { currency: 'EUR' }),
      ),
      {
        target: { value: '0' },
      },
    );

    expect(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 0,
        }),
      }),
    ).toBeDisabled();
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('toasts when checkout has no url', async () => {
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: {},
    } as never);

    const { i18n } = renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.promotions.boost_total', {
          currency: '€',
          total: 15,
        }),
      }),
    );

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(
        i18n!.t('creator.promotions.error_create'),
        'error',
      );
    });
    expect(window.location.href).toBe('http://localhost/p/post-1');
  });
});
