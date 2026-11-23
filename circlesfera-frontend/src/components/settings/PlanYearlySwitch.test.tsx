import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import PlanYearlySwitch from './PlanYearlySwitch';

vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

vi.mock('../../services/payments.service', () => ({
  paymentsApi: { switchPlanToYearly: vi.fn() },
}));

const props = {
  name: 'Premium',
  monthlyCents: 999,
  yearlyCents: 9990,
  currency: 'EUR',
};

describe('PlanYearlySwitch', () => {
  const originalLocation = window.location;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('offers the yearly price beside the monthly one, with what it saves', () => {
    renderWithProviders(<PlanYearlySwitch {...props} />);

    expect(screen.getByTestId('plan-yearly-switch')).toHaveTextContent(
      'Pay by the year: €99.90 a year instead of €9.99 a month, 17% less.',
    );
    expect(
      screen.getByRole('button', { name: 'Pay by the year' }),
    ).toBeVisible();
  });

  it('is in Spanish for a Spanish reader', () => {
    renderWithProviders(<PlanYearlySwitch {...props} />, { lng: 'es' });

    expect(screen.getByRole('button', { name: 'Pagar por año' })).toBeVisible();
  });

  it('moves the plan only at the second step, once the person asks for the year to start now', async () => {
    vi.mocked(paymentsApi.switchPlanToYearly).mockResolvedValue({
      subscription: { billingInterval: 'year' },
      paymentUrl: null,
    });
    const { queryClient } = renderWithProviders(
      <PlanYearlySwitch {...props} />,
    );
    const setData = vi.spyOn(queryClient, 'setQueryData');

    fireEvent.click(screen.getByRole('button', { name: 'Pay by the year' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Your year of Premium starts today');
    const confirm = screen.getByRole('button', {
      name: 'Pay €99.90 a year',
    });
    // Without the box ticked nothing can be charged.
    expect(confirm).toBeDisabled();
    expect(paymentsApi.switchPlanToYearly).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(paymentsApi.switchPlanToYearly).toHaveBeenCalledWith({
        withdrawalConsent: true,
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Your plan is now paid by the year.',
      ),
    );
    expect(setData).toHaveBeenCalledWith(
      ['billingStatus'],
      expect.objectContaining({ paymentUrl: null }),
    );
  });

  it("opens the provider's page to pay when the charge waits for the person", async () => {
    const location = { href: 'http://localhost/settings' };
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: location,
    });
    vi.mocked(paymentsApi.switchPlanToYearly).mockResolvedValue({
      subscription: { billingInterval: 'month' },
      paymentUrl: 'https://pay.example/inv_1',
    });
    renderWithProviders(<PlanYearlySwitch {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pay by the year' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Pay €99.90 a year' }));

    await waitFor(() =>
      expect(location.href).toBe('https://pay.example/inv_1'),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says the payment is being processed, not that the plan moved, when the charge still waits with no page to open', async () => {
    vi.mocked(paymentsApi.switchPlanToYearly).mockResolvedValue({
      subscription: { billingInterval: 'month' },
      pending: true,
      paymentUrl: null,
    });
    renderWithProviders(<PlanYearlySwitch {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pay by the year' }));
    expect(
      screen.getByRole('heading', { name: 'Pay Premium by the year?' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Pay €99.90 a year' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Your payment is being processed. Your plan moves to yearly once it is paid.',
      ),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('says so when the plan could not be moved', async () => {
    vi.mocked(paymentsApi.switchPlanToYearly).mockRejectedValue(
      new Error('network'),
    );
    renderWithProviders(<PlanYearlySwitch {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Pay by the year' }));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Pay €99.90 a year' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Your plan could not be moved to yearly. Check your plan below before trying again.',
      ),
    );
  });
});
