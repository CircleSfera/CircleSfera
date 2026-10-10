import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import toast from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import MonetizationTab from './MonetizationTab';
import PromotionsTab from './PromotionsTab';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getPromotions: vi.fn(),
    updatePromotion: vi.fn(),
    getMonetizationAnalytics: vi.fn(),
    getTransactions: vi.fn(),
  },
}));
vi.mock('../../services/payments.service', () => ({
  paymentsApi: { getAdminLedger: vi.fn() },
}));
vi.mock('../../hooks/useDebouncedValue', () => ({
  useDebouncedValue: <T,>(value: T) => value,
}));
vi.mock('../../utils/adminPanel', () => ({
  platformOrigin: () => 'https://circlesfera.test',
}));
vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const api = vi.mocked(adminApi);
const onToast = vi.fn();

const list = <T,>(rows: T[], pageNumber = 1, totalPages = 1, limit = 20) => ({
  data: {
    data: rows,
    meta: {
      total: rows.length * totalPages,
      page: pageNumber,
      limit,
      totalPages,
    },
  },
});
const rowOf = (text: string) =>
  screen
    .getAllByText(text)
    .map((el) => el.closest('[role="button"]'))
    .find(Boolean) as HTMLElement;
const detail = () => screen.getByRole('region', { name: 'Detail' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PromotionsTab', () => {
  const promo = (id: string, over: object = {}) => ({
    id,
    userId: `u-${id}`,
    targetType: 'POST',
    targetId: `post-${id}`,
    budgetCents: 2550,
    currency: 'EUR',
    status: 'PENDING',
    startDate: '2026-03-12T00:00:00Z',
    endDate: '2026-03-19T00:00:00Z',
    reach: 12000,
    createdAt: '2026-03-10T11:00:00Z',
    user: {
      email: `${id}@example.com`,
      profile: { username: `brand_${id}`, avatar: '' },
    },
    target: {
      caption: `Buy ${id}`,
      media: [{ url: `https://media.test/${id}.jpg`, type: 'image' }],
    },
    ...over,
  });
  const show = () => renderWithProviders(<PromotionsTab onToast={onToast} />);

  beforeEach(() => {
    api.getPromotions.mockResolvedValue(list([]) as never);
    api.updatePromotion.mockResolvedValue({} as never);
  });

  it('asks for every request and says when there are none', async () => {
    show();

    expect(await screen.findByText('No promotions found')).toBeInTheDocument();
    expect(api.getPromotions).toHaveBeenCalledWith(1, 20, undefined, undefined);
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('Requests (0)').length).toBeGreaterThan(0);
  });

  it('filters by status and search, and clears both from the empty list', async () => {
    api.getPromotions.mockImplementation(
      (pageNumber = 1, _limit, status, search) =>
        Promise.resolve(
          (status || search
            ? list([])
            : list([promo(`p${pageNumber}`)], pageNumber, 2)) as never,
        ),
    );
    show();
    await screen.findByText('@brand_p1');

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findByText('@brand_p2');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'PENDING' },
    });
    await waitFor(() =>
      expect(api.getPromotions).toHaveBeenLastCalledWith(
        1,
        20,
        'PENDING',
        undefined,
      ),
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Search user...' }), {
      target: { value: 'acme' },
    });
    await waitFor(() =>
      expect(api.getPromotions).toHaveBeenLastCalledWith(
        1,
        20,
        'PENDING',
        'acme',
      ),
    );
    expect(
      await screen.findByText('No promotions match these filters'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('@brand_p1')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: 'Search user...' })).toHaveValue(
      '',
    );
  });

  it('shows each request with its budget in units and its estimated reach', async () => {
    api.getPromotions.mockResolvedValue(
      list([
        promo('a', {
          target: {
            media: [
              {
                url: 'https://media.test/a.jpg',
                thumbnailUrl: 'https://media.test/a-thumb.jpg',
              },
            ],
          },
        }),
        promo('b', { budgetCents: 500, reach: 0, target: null, user: null }),
        promo('c', { target: { url: 'https://media.test/c-story.jpg' } }),
      ]) as never,
    );
    show();

    await screen.findByText('@brand_a');
    const first = rowOf('@brand_a');
    expect(
      within(first).getByText('25.50 EUR · 12,000 est. reach'),
    ).toBeInTheDocument();
    expect(within(first).getByText('PENDING')).toBeInTheDocument();
    expect(first.querySelector('img')).toHaveAttribute(
      'src',
      'https://media.test/a-thumb.jpg',
    );

    const bare = rowOf('@—');
    expect(
      within(bare).getByText('5.00 EUR · 0 est. reach'),
    ).toBeInTheDocument();
    expect(bare.querySelector('img')).toBeNull();
    expect(rowOf('@brand_c').querySelector('img')).toHaveAttribute(
      'src',
      'https://media.test/c-story.jpg',
    );
  });

  it('opens a request with its figures, what is promoted and a link to the post', async () => {
    api.getPromotions.mockResolvedValue(
      list([
        promo('a', {
          target: {
            caption: 'Buy a',
            media: [
              { url: 'https://media.test/a.jpg', type: 'image' },
              { url: 'https://media.test/a2.jpg', type: 'image' },
            ],
          },
        }),
      ]) as never,
    );
    show();
    await screen.findByText('@brand_a');

    fireEvent.click(rowOf('@brand_a'));

    const open = detail();
    expect(within(open).getByText('a@example.com')).toBeInTheDocument();
    expect(within(open).getByText('Budget').parentElement).toHaveTextContent(
      '25.50 EUR',
    );
    expect(
      within(open).getByText('Est. Reach').parentElement,
    ).toHaveTextContent('12,000');
    expect(within(open).getByText('POST Promoted')).toBeInTheDocument();
    expect(within(open).getByText('Buy a')).toBeInTheDocument();
    expect(within(open).getByText('1/2')).toBeInTheDocument();
    const link = within(open).getByRole('link', { name: 'Open in new tab' });
    expect(link).toHaveAttribute('href', 'https://circlesfera.test/p/post-a');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // On a phone the two buttons show only an icon: they keep their name.
    expect(within(open).getByRole('button', { name: 'Approve' })).toHaveClass(
      'min-h-11',
      'min-w-11',
    );
    expect(
      within(open).getByRole('button', { name: 'Reject' }),
    ).toBeInTheDocument();
  });

  it('plays a promoted video, falls back to the text and links only posts', async () => {
    api.getPromotions.mockResolvedValue(
      list([
        promo('s', {
          targetType: 'STORY',
          target: {
            text: 'Story text',
            media: [{ url: 'https://media.test/s.mp4', type: 'video/mp4' }],
          },
        }),
        promo('p', { targetType: 'PROFILE', target: null }),
      ]) as never,
    );
    show();
    await screen.findByText('@brand_s');

    fireEvent.click(rowOf('@brand_s'));
    let open = detail();
    expect(open.querySelector('video')).toHaveAttribute(
      'src',
      'https://media.test/s.mp4',
    );
    expect(within(open).getByText('Story text')).toBeInTheDocument();
    expect(within(open).getByText('STORY Promoted')).toBeInTheDocument();
    expect(within(open).queryByRole('link')).not.toBeInTheDocument();

    fireEvent.click(rowOf('@brand_p'));
    await waitFor(() =>
      expect(
        within(detail()).getByText('PROFILE Promoted'),
      ).toBeInTheDocument(),
    );
    open = detail();
    expect(within(open).getByText('No description')).toBeInTheDocument();
    expect(open.querySelector('video, img.object-contain')).toBeNull();
    expect(within(open).queryByRole('link')).not.toBeInTheDocument();
  });

  it('decides only pending requests', async () => {
    api.getPromotions.mockResolvedValue(
      list([promo('a', { status: 'ACTIVE' })]) as never,
    );
    show();
    await screen.findByText('@brand_a');

    fireEvent.click(rowOf('@brand_a'));

    const open = detail();
    expect(
      within(open).queryByRole('button', { name: 'Approve' }),
    ).not.toBeInTheDocument();
    expect(
      within(open).queryByRole('button', { name: 'Reject' }),
    ).not.toBeInTheDocument();
  });

  it('approves a request and moves on to the next one', async () => {
    api.getPromotions.mockResolvedValue(
      list([promo('a'), promo('b')]) as never,
    );
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(api.updatePromotion).toHaveBeenCalledWith(
        'a',
        'ACTIVE',
        undefined,
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Promotion approved', 'success'),
    );
    await waitFor(() =>
      expect(within(detail()).getByText('b@example.com')).toBeInTheDocument(),
    );
    expect(api.getPromotions).toHaveBeenCalledTimes(2);
  });

  it('rejects with the reason typed and goes back to the list after the last one', async () => {
    api.getPromotions.mockResolvedValue(list([promo('a')]) as never);
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reject promotion?')).toBeInTheDocument();
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'Rejection reason' }),
      { target: { value: '  Misleading claim  ' } },
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(api.updatePromotion).toHaveBeenCalledWith(
        'a',
        'REJECTED',
        'Misleading claim',
      ),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith('Promotion rejected', 'success'),
    );
    await waitFor(() =>
      expect(screen.queryByText('a@example.com')).not.toBeInTheDocument(),
    );
  });

  it('rejects without a reason, and rejects nothing on cancel', async () => {
    api.getPromotions.mockResolvedValue(list([promo('a')]) as never);
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Reject' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(api.updatePromotion).not.toHaveBeenCalled();

    fireEvent.click(within(detail()).getByRole('button', { name: 'Reject' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Reject',
      }),
    );
    await waitFor(() =>
      expect(api.updatePromotion).toHaveBeenCalledWith('a', 'REJECTED', ''),
    );
  });

  it('says so when the decision cannot be saved and keeps the request open', async () => {
    api.updatePromotion.mockRejectedValue(new Error('no'));
    api.getPromotions.mockResolvedValue(list([promo('a')]) as never);
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));

    fireEvent.click(within(detail()).getByRole('button', { name: 'Approve' }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        'Failed to update promotion',
        'error',
      ),
    );
    expect(within(detail()).getByText('a@example.com')).toBeInTheDocument();
  });

  it('goes back to the list when the open request is no longer listed', async () => {
    api.getPromotions.mockImplementation((_page, _limit, status) =>
      Promise.resolve((status ? list([]) : list([promo('a')])) as never),
    );
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));
    expect(within(detail()).getByText('a@example.com')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'COMPLETED' },
    });

    await screen.findByText('No promotions match these filters');
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
  });

  it('closes the open request with Escape', async () => {
    api.getPromotions.mockResolvedValue(list([promo('a')]) as never);
    show();
    await screen.findByText('@brand_a');
    fireEvent.click(rowOf('@brand_a'));

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByText('a@example.com')).not.toBeInTheDocument(),
    );
  });
});

describe('MonetizationTab', () => {
  const analytics = (over: object = {}) => ({
    data: {
      activeMRR: 120,
      totalSubscriptions: 14,
      subscriptionGrowth: 25,
      tierDistribution: { PREMIUM: 6, ELITE: 3, BUSINESS: 1 },
      ...over,
    },
  });
  const tx = (id: string, over: object = {}) => ({
    id,
    type: 'SUBSCRIPTION',
    amount: 999,
    currency: 'EUR',
    status: 'COMPLETED',
    description: `Plan ${id}`,
    createdAt: '2026-03-10T11:00:00Z',
    sender: {
      email: `${id}@example.com`,
      profile: { username: `payer_${id}` },
    },
    receiver: { email: 'r@example.com', profile: { username: 'creator' } },
    ...over,
  });
  const show = () => renderWithProviders(<MonetizationTab />);
  const card = (label: string) =>
    screen.getByText(label).parentElement as HTMLElement;
  const tier = (label: string) =>
    screen.getByText(label).closest('.justify-between') as HTMLElement;
  const tableRow = (text: string) =>
    screen
      .getAllByText(text)
      .map((el) => el.closest('tr'))
      .find(Boolean) as HTMLElement;
  const phoneCard = (text: string) =>
    screen
      .getAllByText(text)
      .map((el) => el.closest('.relative.flex'))
      .find(Boolean) as HTMLElement;

  beforeEach(() => {
    api.getMonetizationAnalytics.mockResolvedValue(analytics() as never);
    api.getTransactions.mockResolvedValue(list([]) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows placeholders while the figures load', () => {
    api.getMonetizationAnalytics.mockReturnValue(new Promise(() => {}));
    const { container } = show();

    expect(
      screen.getByRole('heading', { name: 'Monetization' }),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse .h-28')).toHaveLength(2);
    expect(
      screen.queryByRole('button', { name: 'Export financial ledger as CSV' }),
    ).not.toBeInTheDocument();
  });

  it('says the figures could not be read', async () => {
    api.getMonetizationAnalytics.mockRejectedValue(new Error('down'));
    show();

    expect(await screen.findByText('Analytics Error')).toBeInTheDocument();
    expect(screen.queryByText('Transactions')).not.toBeInTheDocument();
  });

  it('shows revenue, subscriptions, growth and the share of each plan', async () => {
    show();

    await screen.findByText('Platform MRR');
    await waitFor(
      () => {
        expect(card('Platform MRR')).toHaveTextContent('120');
        expect(card('Active Subscriptions')).toHaveTextContent('14');
      },
      { timeout: 4000 },
    );
    expect(card('Platform MRR')).toHaveTextContent('+25%');
    expect(
      screen.getByText('Subscription growth').closest('.flex-col'),
    ).toHaveTextContent('+25%');

    expect(tier('Verified')).toHaveTextContent('6 Members');
    expect(tier('Verified')).toHaveTextContent('60%');
    expect(tier('Elite Creator')).toHaveTextContent('3 Members');
    expect(tier('Elite Creator')).toHaveTextContent('30%');
    expect(tier('Business')).toHaveTextContent('1 Members');
    expect(tier('Business')).toHaveTextContent('10%');
  });

  it.each([
    [-4, '-4%'],
    [0, '0%'],
    [undefined, '—'],
  ])('writes a growth of %s as %s', async (subscriptionGrowth, text) => {
    api.getMonetizationAnalytics.mockResolvedValue(
      analytics({ subscriptionGrowth }) as never,
    );
    show();

    const title = await screen.findByText('Subscription growth');
    expect(
      (title.closest('.flex-col') as HTMLElement).querySelector('.text-2xl'),
    ).toHaveTextContent(text);
  });

  it('shows zeros with nobody subscribed, without dividing by zero', async () => {
    api.getMonetizationAnalytics.mockResolvedValue({ data: {} } as never);
    show();

    await screen.findByText('Platform MRR');
    for (const name of ['Verified', 'Elite Creator', 'Business']) {
      expect(tier(name)).toHaveTextContent('0 Members');
      expect(tier(name)).toHaveTextContent('0%');
    }
    expect(card('Active Subscriptions')).toHaveTextContent('0');
  });

  it('lists the transactions with the amount in units and who paid whom', async () => {
    api.getTransactions.mockResolvedValue(
      list([
        tx('a'),
        tx('b', {
          amount: 50,
          status: 'FAILED',
          description: null,
          type: 'TIP',
          sender: { email: 'b@example.com', profile: null },
          receiver: null,
        }),
        tx('c', {
          status: 'REFUNDED',
          receiver: null,
          description: 'Refund c',
        }),
        tx('d', { status: 'PENDING', sender: null, description: 'Wait d' }),
        tx('e', { status: 'weird', description: 'Odd e' }),
      ]) as never,
    );
    show();

    await screen.findAllByText('Plan a');
    expect(phoneCard('Plan a')).toHaveTextContent('@payer_a → @creator');
    expect(phoneCard('Plan a')).toHaveTextContent('9.99 EUR');
    expect(within(phoneCard('Plan a')).getByText('COMPLETED')).toHaveClass(
      'text-green-400',
    );
    expect(tableRow('@payer_a → @creator')).toHaveTextContent('9.99 EUR');
    expect(tableRow('@payer_a → @creator')).toHaveTextContent('SUBSCRIPTION');

    expect(phoneCard('b@example.com')).toHaveTextContent('TIP');
    expect(phoneCard('b@example.com')).toHaveTextContent('0.50 EUR');
    expect(within(phoneCard('b@example.com')).getByText('FAILED')).toHaveClass(
      'text-red-400',
    );
    expect(tableRow('0.50 EUR')).toHaveTextContent('—');

    expect(phoneCard('Refund c')).toHaveTextContent('@payer_c → @—');
    expect(within(phoneCard('Refund c')).getByText('REFUNDED')).toHaveClass(
      'text-purple-400',
    );
    expect(within(phoneCard('Odd e')).getByText('weird')).toHaveClass(
      'text-white/50',
    );
    expect(phoneCard('Wait d')).toHaveTextContent('—');
    expect(within(phoneCard('Wait d')).getByText('PENDING')).toHaveClass(
      'text-yellow-400',
    );
  });

  it('asks again from the first page on a new status or search', async () => {
    api.getTransactions.mockImplementation((pageNumber = 1) =>
      Promise.resolve(list([tx(`t${pageNumber}`)], pageNumber, 3) as never),
    );
    show();
    await screen.findAllByText('Plan t1');
    expect(api.getTransactions).toHaveBeenCalledWith(
      1,
      20,
      undefined,
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await screen.findAllByText('Plan t2');

    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
      target: { value: 'FAILED' },
    });
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        1,
        20,
        'FAILED',
        undefined,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        2,
        20,
        'FAILED',
        undefined,
      ),
    );
    fireEvent.change(
      screen.getByRole('textbox', {
        name: 'Search by user, email, or description...',
      }),
      { target: { value: 'ana' } },
    );
    await waitFor(() =>
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        1,
        20,
        'FAILED',
        'ana',
      ),
    );
  });

  it('says there are no transactions', async () => {
    show();

    expect(await screen.findByText('No transactions')).toBeInTheDocument();
  });

  it('downloads the ledger as a file and says so', async () => {
    const created = vi.fn(() => 'blob:ledger');
    const revoked = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: created,
      revokeObjectURL: revoked,
    });
    let name = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      name = this.download;
    });
    vi.mocked(paymentsApi.getAdminLedger).mockResolvedValue('date,amount');
    show();
    await screen.findByText('Platform MRR');

    fireEvent.click(
      screen.getByRole('button', { name: 'Export financial ledger as CSV' }),
    );

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Ledger exported'),
    );
    expect(name).toBe('circlesfera-ledger.csv');
    expect((created.mock.calls[0] as unknown as [Blob])[0].type).toBe(
      'text/csv',
    );
    expect(revoked).toHaveBeenCalledWith('blob:ledger');
  });

  it('says so when the ledger cannot be produced', async () => {
    vi.mocked(paymentsApi.getAdminLedger).mockRejectedValue(new Error('no'));
    show();
    await screen.findByText('Platform MRR');

    fireEvent.click(
      screen.getByRole('button', { name: 'Export financial ledger as CSV' }),
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to export ledger'),
    );
  });
});
