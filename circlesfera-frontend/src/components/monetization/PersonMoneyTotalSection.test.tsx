import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  monetizationApi,
  type PersonMoneyTotal,
} from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import PersonMoneyTotalSection from './PersonMoneyTotalSection';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: { getPersonTotal: vi.fn() },
}));

const twoProfiles: PersonMoneyTotal = {
  totalEarningsCents: 3000,
  currentMonthEarningsCents: 1200,
  unassignedEarningsCents: 0,
  profiles: [
    {
      profileId: 'p-1',
      username: 'ana',
      avatar: null,
      accountType: 'CREATOR',
      ownPayoutAccount: true,
      earningsCents: 2000,
      currentMonthEarningsCents: 700,
    },
    {
      profileId: 'p-2',
      username: 'ana_shop',
      avatar: null,
      accountType: 'BUSINESS',
      ownPayoutAccount: false,
      earningsCents: 1000,
      currentMonthEarningsCents: 500,
    },
  ],
};

describe('PersonMoneyTotalSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the person's total and each Profile with its own figures", async () => {
    vi.mocked(monetizationApi.getPersonTotal).mockResolvedValue(twoProfiles);

    const { i18n } = renderWithProviders(<PersonMoneyTotalSection />);

    expect(
      await screen.findByText(i18n!.t('creator.income.all_profiles.title')),
    ).toBeInTheDocument();
    expect(screen.getByText('€30.00')).toBeInTheDocument();
    expect(screen.getByText('€12.00')).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('€20.00')).toBeInTheDocument();
    expect(screen.getByText('€7.00 this month')).toBeInTheDocument();
    expect(screen.getByText('@ana_shop')).toBeInTheDocument();
    expect(screen.getByText('€10.00')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.income.all_profiles.own_account')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('creator.income.all_profiles.shared_account')),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(i18n!.t('creator.income.all_profiles.earlier')),
    ).not.toBeInTheDocument();
  });

  it('adds the income from before it was kept per Profile', async () => {
    vi.mocked(monetizationApi.getPersonTotal).mockResolvedValue({
      ...twoProfiles,
      totalEarningsCents: 3450,
      unassignedEarningsCents: 450,
    });

    const { i18n } = renderWithProviders(<PersonMoneyTotalSection />);

    expect(
      await screen.findByText(i18n!.t('creator.income.all_profiles.earlier')),
    ).toBeInTheDocument();
    expect(screen.getByText('€4.50')).toBeInTheDocument();
  });

  it('shows earlier income even with a single Profile', async () => {
    vi.mocked(monetizationApi.getPersonTotal).mockResolvedValue({
      ...twoProfiles,
      profiles: [twoProfiles.profiles[0]],
      unassignedEarningsCents: 450,
    });

    const { i18n } = renderWithProviders(<PersonMoneyTotalSection />);

    expect(
      await screen.findByText(i18n!.t('creator.income.all_profiles.earlier')),
    ).toBeInTheDocument();
  });

  it('stays out of the way for a person with one Profile and nothing earlier', async () => {
    vi.mocked(monetizationApi.getPersonTotal).mockResolvedValue({
      ...twoProfiles,
      profiles: [twoProfiles.profiles[0]],
    });

    const { container } = renderWithProviders(<PersonMoneyTotalSection />);

    await vi.waitFor(() =>
      expect(monetizationApi.getPersonTotal).toHaveBeenCalled(),
    );
    expect(container).toBeEmptyDOMElement();
  });
});
