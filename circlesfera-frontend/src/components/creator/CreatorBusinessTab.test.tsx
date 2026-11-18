import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { businessStatsApi } from '../../services/businessStats.service';
import { renderWithProviders } from '../../test/test-utils';
import CreatorBusinessTab, { bestLocalHours } from './CreatorBusinessTab';

// The chart needs a browser's layout; here it is a list of its points.
vi.mock('./CreatorTrendChart', () => ({
  default: ({ data }: { data: unknown[] }) => (
    <div data-testid="business-chart">{data.length}</div>
  ),
}));
vi.mock('../../services/businessStats.service', () => ({
  businessStatsApi: { read: vi.fn() },
}));

const totals = {
  visits: 12,
  emailTaps: 2,
  callTaps: 3,
  addressTaps: 1,
  websiteTaps: 4,
};
const stats = (over: object = {}) => ({
  days: 28,
  totals,
  daily: Array.from({ length: 28 }, (_, i) => ({
    day: `2026-10-${String(22 + (i % 9)).padStart(2, '0')}`,
    ...totals,
  })),
  countries: [
    { country: 'ES', visits: 9 },
    { country: '', visits: 3 },
  ],
  otherCountriesVisits: 2,
  viewsByHour: Array.from({ length: 24 }, (_, h) =>
    h === 18 ? 40 : h === 9 ? 10 : 0,
  ),
  ...over,
});

describe('the business statistics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(businessStatsApi.read).mockResolvedValue(stats() as never);
  });

  it('shows the totals, the countries, and the best hours', async () => {
    const { i18n } = renderWithProviders(<CreatorBusinessTab />);
    expect(
      await screen.findByTestId('business-total-visits'),
    ).toHaveTextContent('12');
    expect(screen.getByTestId('business-total-calls')).toHaveTextContent('3');
    expect(screen.getByTestId('business-total-websites')).toHaveTextContent(
      '4',
    );
    expect(screen.getByText('Spain')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.business.unknown_country')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.business.other_countries')),
    ).toBeInTheDocument();
    expect(businessStatsApi.read).toHaveBeenCalledWith(28);
    expect(screen.getByTestId('business-chart')).toHaveTextContent('28');
  });

  it('reads another period when one is chosen', async () => {
    const { i18n } = renderWithProviders(<CreatorBusinessTab />);
    await screen.findByTestId('business-total-visits');
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.business.last_days', { count: 7 }),
      }),
    );
    await waitFor(() => expect(businessStatsApi.read).toHaveBeenCalledWith(7));
  });

  it('says when there are no visits or views yet', async () => {
    vi.mocked(businessStatsApi.read).mockResolvedValue(
      stats({
        countries: [],
        otherCountriesVisits: 0,
        viewsByHour: Array(24).fill(0),
      }) as never,
    );
    const { i18n } = renderWithProviders(<CreatorBusinessTab />);
    expect(
      await screen.findByText(i18n!.t('creator.business.no_visits')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.business.no_views')),
    ).toBeInTheDocument();
  });

  it('says when it could not load, with a way to try again', async () => {
    vi.mocked(businessStatsApi.read).mockRejectedValueOnce(new Error('x'));
    const { i18n } = renderWithProviders(<CreatorBusinessTab />);
    const retry = await screen.findByRole('button', {
      name: i18n!.t('creator.business.retry'),
    });
    fireEvent.click(retry);
    await screen.findByTestId('business-total-visits');
  });
});

describe('the best hours', () => {
  it('turns UTC hours into the person’s time, the busiest first', () => {
    const views = Array(24).fill(0);
    views[17] = 40;
    views[8] = 10;
    views[23] = 10;
    // One hour ahead of UTC: getTimezoneOffset is -60.
    expect(bestLocalHours(views, -60)).toEqual([
      { hour: 18, views: 40 },
      { hour: 0, views: 10 },
      { hour: 9, views: 10 },
    ]);
    expect(bestLocalHours(views, 300, 1)).toEqual([{ hour: 12, views: 40 }]);
  });
});
