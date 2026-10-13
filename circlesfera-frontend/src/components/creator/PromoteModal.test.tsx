import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorPost } from '../../services/creator.service';
import { creatorApi } from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import PromoteModal from './PromoteModal';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    createPromotion: vi.fn(),
    getPosts: vi.fn(),
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
const frame: CreatorPost = {
  ...post,
  id: 'frame-1',
  caption: 'Morning frame',
  type: 'FRAME',
};

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_boost';

describe('PromoteModal', () => {
  const onClose = vi.fn();
  const onToast = vi.fn();
  const open = (given?: CreatorPost, lng?: 'en' | 'es') =>
    renderWithProviders(
      <PromoteModal post={given} onClose={onClose} onToast={onToast} />,
      lng ? { lng } : undefined,
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: { url: checkoutUrl },
    } as never);
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [post, frame], meta: { total: 2 } },
    } as never);
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { href: 'http://localhost/p/post-1' },
    });
  });

  it('closes without creating anything', async () => {
    const user = userEvent.setup();
    open(post);

    expect(
      screen.getByRole('heading', { name: 'Promote a post' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
    expect(creatorApi.createPromotion).not.toHaveBeenCalled();
  });

  it('opens from a post on its settings, with 5 euros a day for 7 days', async () => {
    const user = userEvent.setup();
    open(post);

    expect(creatorApi.getPosts).not.toHaveBeenCalled();
    expect(screen.getByText('Sunset reel')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose another' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '€5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(
      screen.getByRole('button', { name: 'Pay €35 and promote' }),
    );

    await waitFor(() =>
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'post',
        targetId: 'post-1',
        dailyBudget: 5,
        durationDays: 7,
        currency: 'EUR',
        countries: undefined,
      }),
    );
    await waitFor(() => expect(window.location.href).toBe(checkoutUrl));
    expect(onToast).toHaveBeenCalledWith(
      'Redirecting to secure checkout...',
      'success',
    );
  });

  it('sends the chosen budget and days, and the places without spaces around', async () => {
    const user = userEvent.setup();
    open(frame);

    await user.click(screen.getByRole('button', { name: '€25' }));
    await user.click(screen.getByRole('button', { name: '14 days' }));
    await user.type(
      screen.getByLabelText('Places (optional)'),
      '  Madrid, Lisbon ',
    );
    await user.click(
      screen.getByRole('button', { name: 'Pay €350 and promote' }),
    );

    await waitFor(() =>
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'frame',
        targetId: 'frame-1',
        dailyBudget: 25,
        durationDays: 14,
        currency: 'EUR',
        countries: 'Madrid, Lisbon',
      }),
    );
  });

  it('says what is paid and when the promotion ends, and promises no reach', () => {
    open(post);

    expect(
      screen.getByText(
        'You pay it now, once. The promotion ends when the budget is spent or after 7 days, whichever comes first.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reach/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/objective/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/interests/i)).not.toBeInTheDocument();
  });

  it('asks which post first when it opens with none', async () => {
    const user = userEvent.setup();
    open();

    expect(
      await screen.findByRole('heading', {
        name: 'Which post do you want to promote?',
      }),
    ).toBeInTheDocument();
    await user.click(
      await screen.findByRole('button', { name: /Sunset reel/ }),
    );

    expect(
      screen.getByRole('heading', { name: 'Promote a post' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose another' }));
    expect(
      screen.getByRole('heading', {
        name: 'Which post do you want to promote?',
      }),
    ).toBeInTheDocument();
  });

  it('says there is nothing to promote when there are no posts', async () => {
    vi.mocked(creatorApi.getPosts).mockResolvedValue({
      data: { data: [], meta: { total: 0 } },
    } as never);
    open();

    expect(
      await screen.findByText('You have no posts to promote yet.'),
    ).toBeInTheDocument();
  });

  it('says so when the checkout has no address, and stays', async () => {
    const user = userEvent.setup();
    vi.mocked(creatorApi.createPromotion).mockResolvedValue({
      data: { url: null },
    } as never);
    open(post);

    await user.click(
      screen.getByRole('button', { name: 'Pay €35 and promote' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Error creating promotion', 'error'),
    );
    expect(window.location.href).toBe('http://localhost/p/post-1');
  });

  it('says so when the campaign cannot be created', async () => {
    const user = userEvent.setup();
    vi.mocked(creatorApi.createPromotion).mockRejectedValue(new Error('no'));
    open(post);

    await user.click(
      screen.getByRole('button', { name: 'Pay €35 and promote' }),
    );

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Error creating promotion', 'error'),
    );
  });

  it('is written in Spanish for a Spanish reader', () => {
    open(post, 'es');

    expect(
      screen.getByRole('heading', { name: 'Promocionar una publicación' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Presupuesto por día')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 días' })).toBeInTheDocument();
  });
});
