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
    renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    expect(screen.getByText('Boost Post')).toBeInTheDocument();
    expect(screen.getByText('Sunset reel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('creates with the default 5 EUR for 3 days and empty targeting strings', async () => {
    renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /boost for €15 total/i }),
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
      'Redirecting to secure checkout...',
      'success',
    );
    expect(window.location.href).toBe(checkoutUrl);
  });

  it('lowercases FRAME to frame', async () => {
    renderWithProviders(
      <PromoteModal
        post={{ ...post, id: 'frame-1', type: 'FRAME' }}
        onClose={onClose}
        onToast={onToast}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /boost for €15 total/i }),
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
    renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Get Followers' }));
    fireEvent.change(screen.getByLabelText('Daily Budget (EUR)'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByLabelText('Campaign Duration'), {
      target: { value: '7' },
    });
    fireEvent.change(screen.getByLabelText(/Countries/i), {
      target: { value: '  ES,PT  ' },
    });
    fireEvent.change(screen.getByLabelText(/Interests/i), {
      target: { value: '  music  ' },
    });

    expect(screen.getByText('€70')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: /boost for €70 total/i }),
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
    renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.change(screen.getByLabelText('Daily Budget (EUR)'), {
      target: { value: '0' },
    });

    expect(
      screen.getByRole('button', { name: /boost for €0 total/i }),
    ).toBeDisabled();
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('toasts when checkout has no url', async () => {
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: {},
    } as never);

    renderWithProviders(
      <PromoteModal post={post} onClose={onClose} onToast={onToast} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /boost for €15 total/i }),
    );

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('Error creating promotion', 'error');
    });
    expect(window.location.href).toBe('http://localhost/p/post-1');
  });
});
