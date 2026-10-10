import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CreatorPromotion,
  creatorApi,
} from '../../services/creator.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPromotionsTab from './CreatorPromotionsTab';

vi.mock('../../services/creator.service', () => ({
  creatorApi: {
    getPromotions: vi.fn(),
    cancelPromotion: vi.fn(),
    pausePromotion: vi.fn(),
    resumePromotion: vi.fn(),
    createPromotion: vi.fn(),
    updatePromotion: vi.fn(),
  },
}));
vi.mock('framer-motion', async () =>
  (await import('../../test/still-motion')).stillMotion(),
);
vi.mock('./NewPromoModal', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="new campaign">
      <button type="button" onClick={onClose}>
        close new campaign
      </button>
    </div>
  ),
}));

const NOW = new Date('2026-03-10T12:00:00Z');
const day = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString();

const promo = (
  id: string,
  over: Partial<CreatorPromotion> = {},
): CreatorPromotion => ({
  id,
  targetType: 'POST',
  targetId: `post-${id}`,
  budgetCents: 2500,
  currency: 'EUR',
  status: 'ACTIVE',
  startDate: day(-2),
  endDate: day(8),
  reach: 1200,
  clicks: 60,
  createdAt: day(-2),
  target: {
    caption: `Caption ${id}`,
    thumbnail: `https://cdn.example/${id}.jpg`,
  },
  ...over,
});

const toastSpy = vi.fn();

function list(promos: CreatorPromotion[], totalPages = 1) {
  vi.mocked(creatorApi.getPromotions).mockImplementation((page = 1) =>
    Promise.resolve({
      data: {
        data: promos,
        meta: { total: promos.length, page, limit: 10, totalPages },
      },
    } as never),
  );
}

async function show(promos: CreatorPromotion[], totalPages = 1) {
  list(promos, totalPages);
  const view = renderWithProviders(<CreatorPromotionsTab onToast={toastSpy} />);
  await waitFor(() => expect(creatorApi.getPromotions).toHaveBeenCalled());
  if (promos.length) await screen.findByText('Campaigns');
  return view;
}

/** Opens a campaign from the list and gives back its detail pane. */
async function open(caption: string) {
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(caption) }),
  );
  return screen
    .getByRole('button', { name: /\+1 day|Repeat/ })
    .closest('div.p-4') as HTMLElement;
}

describe('CreatorPromotionsTab with campaigns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('asks for ten campaigns of the first page and shows the list waiting meanwhile', () => {
    vi.mocked(creatorApi.getPromotions).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithProviders(
      <CreatorPromotionsTab onToast={toastSpy} />,
    );

    expect(creatorApi.getPromotions).toHaveBeenCalledWith(1, 10);
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('groups the campaigns under way and the finished ones, each with its count', async () => {
    await show([
      promo('a'),
      promo('b', { status: 'PENDING' }),
      promo('c', { status: 'paused' }),
      promo('d', { status: 'COMPLETED' }),
      promo('e', { status: 'cancelled', target: null }),
    ]);

    expect(screen.getByText('In Progress (3)')).toBeInTheDocument();
    expect(screen.getByText('Campaign History (2)')).toBeInTheDocument();
    expect(screen.getByText('Completed Campaign')).toBeInTheDocument();
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(
      screen.getByText('Select a campaign from the list'),
    ).toBeInTheDocument();
  });

  it.each([
    ['REJECTED', 'Rejected'],
    ['FAILED', 'Payment failed'],
  ])(
    'keeps a campaign that ended as %s in the history, saying why',
    async (status, badge) => {
      await show([promo('r', { status })]);

      expect(screen.getByText('Campaign History (1)')).toBeInTheDocument();
      expect(screen.getByText(badge)).toBeInTheDocument();

      await open('Caption r');
      expect(screen.getAllByText(badge)).toHaveLength(2);
      expect(
        screen.getByRole('button', { name: 'Repeat' }),
      ).toBeInTheDocument();
    },
  );

  it('names a campaign by its kind when its post has no caption or picture', async () => {
    await show([promo('a', { target: null, targetType: 'FRAME' })]);
    expect(screen.getByText('FRAME Campaign')).toBeInTheDocument();
  });

  describe('the detail of a campaign under way', () => {
    it('shows the budget, the reach and the figures worked out from them', async () => {
      await show([promo('a')]);
      const detail = within(await open('Caption a'));

      expect(detail.getByText('25.00 EUR')).toBeInTheDocument();
      expect(detail.getByText('+1,200')).toBeInTheDocument();
      // 60 clicks out of 1200 people; 25.00 over 60 clicks.
      expect(detail.getByText(/5\.00\s*%/)).toBeInTheDocument();
      expect(detail.getByText(/€\s*0\.42/)).toBeInTheDocument();
      expect(detail.getByText('8 Days Left')).toBeInTheDocument();
    });

    it('shows zero rates for a campaign nobody has seen yet', async () => {
      await show([promo('a', { reach: 0, clicks: 0 })]);
      const detail = within(await open('Caption a'));

      expect(detail.getByText(/0\.00\s*%/)).toBeInTheDocument();
      expect(detail.getByText(/€\s*0\.00/)).toBeInTheDocument();
    });

    it.each([
      [
        'before it starts',
        { startDate: day(1), endDate: day(5) },
        '0%',
        '5 Days Left',
      ],
      [
        'half way',
        { startDate: day(-5), endDate: day(5) },
        '50%',
        '5 Days Left',
      ],
      [
        'past its end',
        { startDate: day(-9), endDate: day(-1) },
        '100%',
        '0 Days Left',
      ],
    ])('draws how far it has run %s', async (_when, dates, width, left) => {
      const { container } = await show([promo('a', dates)]);
      await open('Caption a');

      expect(
        (container.querySelector('.h-2 > div') as HTMLElement).className,
      ).toContain(
        width === '0%'
          ? 'from-brand-primary'
          : width === '50%'
            ? 'from-amber-500'
            : 'from-rose-500',
      );
      expect(screen.getByText(left)).toBeInTheDocument();
    });

    it('pauses a campaign under way and says so', async () => {
      vi.mocked(creatorApi.pausePromotion).mockResolvedValue({} as never);
      await show([promo('a')]);
      await open('Caption a');
      expect(
        screen.queryByRole('button', { name: 'Resume' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Campaign paused', 'success'),
      );
      expect(creatorApi.pausePromotion).toHaveBeenCalledWith('a');
      expect(creatorApi.getPromotions).toHaveBeenCalledTimes(2);
    });

    it('resumes a paused campaign and says so', async () => {
      vi.mocked(creatorApi.resumePromotion).mockResolvedValue({} as never);
      await show([promo('a', { status: 'PAUSED' })]);
      await open('Caption a');
      expect(
        screen.queryByRole('button', { name: 'Pause' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Campaign resumed', 'success'),
      );
      expect(creatorApi.resumePromotion).toHaveBeenCalledWith('a');
    });

    it('says so when pausing or resuming fails', async () => {
      vi.mocked(creatorApi.pausePromotion).mockRejectedValue(new Error('down'));
      vi.mocked(creatorApi.resumePromotion).mockRejectedValue(
        new Error('down'),
      );
      const first = await show([promo('a')]);
      await open('Caption a');
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Error pausing', 'error'),
      );
      first.unmount();

      await show([promo('b', { status: 'PAUSED' })]);
      await open('Caption b');
      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Error resuming', 'error'),
      );
    });

    it('adds one day to the end of the campaign', async () => {
      vi.mocked(creatorApi.updatePromotion).mockResolvedValue({} as never);
      await show([promo('a')]);
      await open('Caption a');

      fireEvent.click(screen.getByRole('button', { name: '+1 day' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith(
          'Campaign extended by 1 day',
          'success',
        ),
      );
      expect(creatorApi.updatePromotion).toHaveBeenCalledWith('a', {
        endDate: day(9),
      });
    });

    it('says so when the end could not be moved, and offers no extra day to one not yet paid', async () => {
      vi.mocked(creatorApi.updatePromotion).mockRejectedValue(
        new Error('down'),
      );
      const first = await show([promo('a')]);
      await open('Caption a');
      fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith(
          'Could not update campaign',
          'error',
        ),
      );
      first.unmount();

      await show([promo('b', { status: 'PENDING' })]);
      fireEvent.click(await screen.findByRole('button', { name: /Caption b/ }));
      expect(
        screen.queryByRole('button', { name: '+1 day' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Pause' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Cancel' }),
      ).toBeInTheDocument();
    });
  });

  describe('cancelling a campaign', () => {
    it('asks first, saying how much comes back, and can be called off', async () => {
      await show([promo('a')]);
      await open('Caption a');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(
        screen.getByText('Unused budget (25.00 EUR) will be refunded.'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'No' }));
      expect(
        screen.queryByRole('button', { name: 'Confirm' }),
      ).not.toBeInTheDocument();
      expect(creatorApi.cancelPromotion).not.toHaveBeenCalled();
    });

    it('does not promise a refund for a campaign with nothing left', async () => {
      await show([promo('a', { budgetCents: 0 })]);
      await open('Caption a');
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText(/will be refunded/)).not.toBeInTheDocument();
    });

    it('says how much was refunded when the refund went through', async () => {
      vi.mocked(creatorApi.cancelPromotion).mockResolvedValue({
        data: {
          refund: { status: 'succeeded', amount: 12.5, currency: 'EUR' },
        },
      } as never);
      await show([promo('a')]);
      await open('Caption a');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith(
          'Promotion cancelled. Refund: 12.50 EUR',
          'success',
        ),
      );
      expect(creatorApi.cancelPromotion).toHaveBeenCalledWith('a');
      expect(
        screen.queryByRole('button', { name: 'Confirm' }),
      ).not.toBeInTheDocument();
    });

    it.each([
      [
        'there was nothing to refund',
        { status: 'succeeded', amount: 0, currency: 'EUR' },
      ],
      [
        'the refund was skipped',
        { status: 'skipped_unpaid', amount: 5, currency: 'EUR' },
      ],
      ['the answer has no refund', undefined],
    ])('says only that it was cancelled when %s', async (_why, refund) => {
      vi.mocked(creatorApi.cancelPromotion).mockResolvedValue({
        data: { refund },
      } as never);
      await show([promo('a')]);
      await open('Caption a');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Promotion cancelled', 'success'),
      );
    });

    it('keeps asking when the cancellation fails', async () => {
      vi.mocked(creatorApi.cancelPromotion).mockRejectedValue(
        new Error('down'),
      );
      await show([promo('a')]);
      await open('Caption a');

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Error cancelling', 'error'),
      );
      expect(
        screen.getByRole('button', { name: 'Confirm' }),
      ).toBeInTheDocument();
    });
  });

  describe('repeating a finished campaign', () => {
    const location = window.location;
    beforeEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...location, href: 'http://localhost/' },
      });
    });
    afterEach(() => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: location,
      });
    });

    it('starts a week with the same post and what was left, and goes to the payment page', async () => {
      vi.mocked(creatorApi.createPromotion).mockResolvedValue({
        data: { url: 'https://pay.example/session', promotionId: 'n1' },
      } as never);
      await show([
        promo('d', { status: 'COMPLETED', budgetCents: 1550, currency: 'USD' }),
      ]);
      await open('Caption d');
      expect(
        screen.queryByRole('button', { name: 'Cancel' }),
      ).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith(
          'Redirecting to secure checkout...',
          'success',
        ),
      );
      expect(creatorApi.createPromotion).toHaveBeenCalledWith({
        targetType: 'POST',
        targetId: 'post-d',
        budget: 15.5,
        durationDays: 7,
        currency: 'USD',
      });
      expect(window.location.href).toBe('https://pay.example/session');
    });

    it.each([
      ['there is nothing left to repeat it with', { budgetCents: 0 }, null],
      ['the server gives no payment page', {}, { data: {} }],
      ['the request fails', {}, 'reject'],
    ])('says it could not be repeated when %s', async (_why, over, answer) => {
      if (answer === 'reject') {
        vi.mocked(creatorApi.createPromotion).mockRejectedValue(
          new Error('down'),
        );
      } else if (answer) {
        vi.mocked(creatorApi.createPromotion).mockResolvedValue(
          answer as never,
        );
      }
      await show([promo('d', { status: 'COMPLETED', ...over })]);
      await open('Caption d');

      fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));

      await waitFor(() =>
        expect(toastSpy).toHaveBeenCalledWith('Error repeating', 'error'),
      );
      expect(window.location.href).toBe('http://localhost/');
      if (answer === null)
        expect(creatorApi.createPromotion).not.toHaveBeenCalled();
    });

    it('pays in euros for a campaign saved with no currency', async () => {
      vi.mocked(creatorApi.createPromotion).mockResolvedValue({
        data: {},
      } as never);
      await show([promo('d', { status: 'COMPLETED', currency: '' })]);
      await open('Caption d');

      fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));

      await waitFor(() =>
        expect(creatorApi.createPromotion).toHaveBeenCalledWith(
          expect.objectContaining({ currency: 'EUR' }),
        ),
      );
    });
  });

  it('opens the new campaign dialog from the button, and from the empty state', async () => {
    const first = await show([promo('a')]);
    fireEvent.click(screen.getByRole('button', { name: 'New Campaign' }));
    expect(
      screen.getByRole('dialog', { name: 'new campaign' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'close new campaign' }));
    expect(
      screen.queryByRole('dialog', { name: 'new campaign' }),
    ).not.toBeInTheDocument();
    first.unmount();

    await show([]);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Create my first campaign' }),
    );
    expect(
      screen.getByRole('dialog', { name: 'new campaign' }),
    ).toBeInTheDocument();
  });

  it('moves between pages and stops at both ends', async () => {
    await show([promo('a')], 2);
    const prev = screen.getByRole('button', { name: /prev/i });
    const next = screen.getByRole('button', { name: /next/i });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(prev).toBeDisabled();

    fireEvent.click(next);
    await screen.findByText('2 / 2');
    expect(creatorApi.getPromotions).toHaveBeenLastCalledWith(2, 10);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    await screen.findByText('1 / 2');
  });

  it('shows no page controls for a single page', async () => {
    await show([promo('a')]);
    expect(screen.queryByText('1 / 1')).not.toBeInTheDocument();
  });
});
