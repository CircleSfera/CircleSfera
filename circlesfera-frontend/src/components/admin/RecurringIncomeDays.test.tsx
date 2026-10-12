import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import { RecurringIncomeDays } from './RecurringIncomeDays';

vi.mock('../../services/admin.service', () => ({
  adminApi: { getRecurringIncomeHistory: vi.fn() },
}));

// Consecutive days ending on the given one, newest first.
const kept = (newest: string, cents: number[]) => ({
  data: {
    days: cents.map((mrrCents, back) => {
      const day = new Date(newest);
      day.setUTCDate(day.getUTCDate() - back);
      return {
        day: day.toISOString().slice(0, 10),
        mrrCents,
        activeSubscriptions: Math.round(mrrCents / 999),
      };
    }),
  },
});
const line = (text: string | RegExp) =>
  screen.getByText(text).closest('li') as HTMLElement;

describe('RecurringIncomeDays', () => {
  beforeEach(() => vi.clearAllMocks());

  it('compares the newest day with the one kept seven and thirty days before', async () => {
    const cents = Array.from({ length: 31 }, () => 4995);
    cents[0] = 5994;
    cents[7] = 3996;
    cents[30] = 5994;
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', cents) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);

    await screen.findByText('7 days before');
    expect(line('7 days before')).toHaveTextContent('€39.96');
    expect(line('7 days before')).toHaveTextContent('+€19.98');
    expect(line('30 days before')).toHaveTextContent('€59.94');
    expect(line('30 days before')).toHaveTextContent('no change');
    // Enough days are read to reach the thirtieth before.
    expect(adminApi.getRecurringIncomeHistory).toHaveBeenCalledWith(31);
  });

  it('lists the last seven days, each as its own date, with what it was counted from', async () => {
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept(
        '2026-03-31',
        [1998, 999, 999, 999, 999, 999, 999, 999, 999],
      ) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);

    const newest = (await screen.findByText('Mar 31, 2026')).closest(
      'li',
    ) as HTMLElement;
    expect(newest).toHaveTextContent('€19.98');
    expect(newest).toHaveTextContent('2 subscriptions');
    expect(line('Mar 30, 2026')).toHaveTextContent('1 subscription');
    expect(screen.getByText('Mar 25, 2026')).toBeInTheDocument();
    expect(screen.queryByText('Mar 24, 2026')).not.toBeInTheDocument();
  });

  it('says a fall as a fall', async () => {
    const cents = Array.from({ length: 8 }, () => 2997);
    cents[0] = 999;
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', cents) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);

    await screen.findByText('7 days before');
    expect(line('7 days before')).toHaveTextContent('−€19.98');
  });

  it('compares with the first day kept while a week has not been kept yet', async () => {
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', [1998, 999, 999]) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);

    const first = (
      await screen.findByText('On Mar 29, 2026, the first day kept')
    ).closest('li') as HTMLElement;
    expect(first).toHaveTextContent('+€9.99');
    expect(screen.queryByText('7 days before')).not.toBeInTheDocument();
  });

  it('says since when it is kept while there is one day, and that there is none', async () => {
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', [999]) as never,
    );
    const { unmount } = renderWithProviders(<RecurringIncomeDays />);
    expect(
      await screen.findByText(/^Kept since Mar 31, 2026\./),
    ).toBeInTheDocument();
    expect(screen.queryByText('Last days')).not.toBeInTheDocument();
    unmount();

    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', []) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);
    expect(
      await screen.findByText('No day has been kept yet.'),
    ).toBeInTheDocument();
  });

  it('says the days could not be read and reads them again when asked', async () => {
    vi.mocked(adminApi.getRecurringIncomeHistory).mockRejectedValueOnce(
      new Error('down'),
    );
    vi.mocked(adminApi.getRecurringIncomeHistory).mockResolvedValue(
      kept('2026-03-31', [999]) as never,
    );
    renderWithProviders(<RecurringIncomeDays />);

    expect(
      await screen.findByText('The days kept could not be read.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }));

    expect(
      await screen.findByText(/^Kept since Mar 31, 2026\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('The days kept could not be read.'),
    ).not.toBeInTheDocument();
  });
});
