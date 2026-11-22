import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { paymentsApi } from '../../services/payments.service';
import { renderWithProviders } from '../../test/test-utils';
import StudioProBilling from './StudioProBilling';

vi.mock('../../services/payments.service', () => ({
  paymentsApi: {
    cancelStudioPro: vi.fn(),
    resumeStudioPro: vi.fn(),
    withdrawStudioPro: vi.fn(),
  },
}));
vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString();
const held = (over: object = {}) => ({
  studioPro: {
    includedInPlan: false,
    subscription: {
      status: 'ACTIVE',
      currentPeriodEnd: future,
      cancelAtPeriodEnd: false,
      ...over,
    },
  },
});

describe('StudioProBilling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows nothing for a Profile without Edits Studio Pro', () => {
    renderWithProviders(
      <StudioProBilling
        billingStatus={{
          studioPro: { includedInPlan: false, subscription: null },
        }}
      />,
    );
    expect(screen.queryByTestId('studio-pro-billing')).not.toBeInTheDocument();
  });

  it('says it comes with the plan, with nothing to cancel', () => {
    const { i18n } = renderWithProviders(
      <StudioProBilling
        billingStatus={{
          studioPro: { includedInPlan: true, subscription: null },
        }}
      />,
    );
    expect(screen.getByTestId('studio-pro-billing')).toHaveTextContent(
      i18n!.t('settings.billing.studio_pro.included'),
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('cancels the add-on after asking, and says so', async () => {
    vi.mocked(paymentsApi.cancelStudioPro).mockResolvedValue({});
    const { i18n } = renderWithProviders(
      <StudioProBilling billingStatus={held()} />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.cancel'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.keep'),
      }),
    );
    expect(paymentsApi.cancelStudioPro).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.cancel'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.cancel_confirm_button'),
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('settings.billing.studio_pro.cancel_done'),
      ),
    );
    expect(paymentsApi.cancelStudioPro).toHaveBeenCalledTimes(1);
  });

  it('offers the withdrawal from the add-on within 14 days, and calls its own endpoint after the confirmation', async () => {
    vi.mocked(paymentsApi.withdrawStudioPro).mockResolvedValue({});
    renderWithProviders(
      <StudioProBilling
        billingStatus={held({ withdrawableUntil: '2026-11-15T12:00:00.000Z' })}
      />,
    );

    expect(screen.getByTestId('plan-withdrawal')).toHaveTextContent(
      'November 15, 2026',
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Edits Studio Pro ends now',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));

    await waitFor(() =>
      expect(paymentsApi.withdrawStudioPro).toHaveBeenCalledTimes(1),
    );
  });

  it('offers no withdrawal from the add-on once the 14 days have passed', () => {
    renderWithProviders(
      <StudioProBilling billingStatus={held({ withdrawableUntil: null })} />,
    );
    expect(screen.queryByTestId('plan-withdrawal')).not.toBeInTheDocument();
  });

  it('says when cancelling fails', async () => {
    vi.mocked(paymentsApi.cancelStudioPro).mockRejectedValue(new Error('x'));
    const { i18n } = renderWithProviders(
      <StudioProBilling billingStatus={held()} />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.cancel'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.cancel_confirm_button'),
      }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.billing.studio_pro.cancel_error'),
      ),
    );
  });

  it('resumes a cancelled add-on while it lasts, and says when that fails', async () => {
    vi.mocked(paymentsApi.resumeStudioPro)
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('x'));
    const { i18n } = renderWithProviders(
      <StudioProBilling billingStatus={held({ cancelAtPeriodEnd: true })} />,
    );
    const resume = screen.getByRole('button', {
      name: i18n!.t('settings.billing.studio_pro.resume'),
    });

    fireEvent.click(resume);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('settings.billing.studio_pro.resume_done'),
      ),
    );
    fireEvent.click(resume);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.billing.studio_pro.resume_error'),
      ),
    );
  });

  it('offers no resume beside a plan that already includes it', () => {
    const { i18n } = renderWithProviders(
      <StudioProBilling
        billingStatus={{
          studioPro: {
            includedInPlan: true,
            subscription: {
              status: 'ACTIVE',
              currentPeriodEnd: future,
              cancelAtPeriodEnd: true,
            },
          },
        }}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('settings.billing.studio_pro.resume'),
      }),
    ).not.toBeInTheDocument();
  });
});
