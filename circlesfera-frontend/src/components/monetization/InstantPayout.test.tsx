import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type InstantPayoutOffer,
  monetizationApi,
} from '../../services/monetization.service';
import { renderWithProviders } from '../../test/test-utils';
import {
  InstantPayoutButton,
  InstantPayoutRequirements,
} from './InstantPayout';

vi.mock('../../services/monetization.service', () => ({
  monetizationApi: {
    getInstantPayoutOffer: vi.fn(),
    createInstantPayout: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const AVAILABLE: InstantPayoutOffer = {
  available: true,
  reason: null,
  trackRecord: null,
  quote: { currency: 'EUR', amountCents: 10000, feeCents: 150, netCents: 9850 },
};

describe('InstantPayoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows nothing when the server offers no instant payout', () => {
    renderWithProviders(
      <InstantPayoutButton
        offer={{ ...AVAILABLE, available: false, reason: 'TRACK_RECORD' }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the amount, the fee and what reaches the bank before paying out', async () => {
    vi.mocked(monetizationApi.createInstantPayout).mockResolvedValue({
      currency: 'EUR',
      netCents: 9850,
      arrivalDate: null,
    });
    const { i18n } = renderWithProviders(
      <InstantPayoutButton offer={AVAILABLE} />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.income.instant.action'),
      }),
    );

    expect(screen.getByText(/100\.00/)).toBeInTheDocument();
    expect(screen.getByText(/1\.50/)).toBeInTheDocument();
    expect(monetizationApi.createInstantPayout).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', { name: /98\.50/ });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(monetizationApi.createInstantPayout).toHaveBeenCalledWith(
        9850,
        expect.stringMatching(/^[A-Za-z0-9-]+$/),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('pays out once per confirmation, with a new key for each', async () => {
    vi.mocked(monetizationApi.createInstantPayout).mockResolvedValue({
      currency: 'EUR',
      netCents: 9850,
      arrivalDate: null,
    });
    const { i18n } = renderWithProviders(
      <InstantPayoutButton offer={AVAILABLE} />,
    );
    const open = () =>
      fireEvent.click(
        screen.getByRole('button', {
          name: i18n!.t('creator.income.instant.action'),
        }),
      );
    open();
    fireEvent.click(screen.getByRole('button', { name: /98\.50/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
    open();
    fireEvent.click(screen.getByRole('button', { name: /98\.50/ }));
    await waitFor(() =>
      expect(monetizationApi.createInstantPayout).toHaveBeenCalledTimes(2),
    );
    const [[, first], [, second]] = vi.mocked(
      monetizationApi.createInstantPayout,
    ).mock.calls;
    expect(first).not.toBe(second);
  });
});

describe('InstantPayoutRequirements', () => {
  it('says what is still needed while the track record is short', () => {
    const { i18n } = renderWithProviders(
      <InstantPayoutRequirements
        offer={{
          available: false,
          reason: 'TRACK_RECORD',
          quote: null,
          trackRecord: {
            minDaysSinceFirstSale: 90,
            daysSinceFirstSale: 30,
            minSales: 10,
            sales: 4,
            disputeFreeDays: 180,
            disputedRecently: false,
          },
        }}
      />,
    );
    expect(
      screen.getByText(
        new RegExp(
          i18n!
            .t('creator.income.instant.progress', { days: 30, count: 4 })
            .replace(/[.]/g, '\\.'),
        ),
      ),
    ).toBeInTheDocument();
  });

  it('says nothing for another reason', () => {
    const { container } = renderWithProviders(
      <InstantPayoutRequirements
        offer={{
          available: false,
          reason: 'RESTRICTED',
          quote: null,
          trackRecord: null,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
