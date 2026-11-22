import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PlanWithdrawal from './PlanWithdrawal';

vi.mock('react-hot-toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const until = '2026-11-15T12:00:00.000Z';

describe('PlanWithdrawal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the last day and a clearly labelled way to withdraw', () => {
    const withdraw = vi.fn();
    renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
    );

    expect(screen.getByTestId('plan-withdrawal')).toHaveTextContent(
      'until November 15, 2026',
    );
    expect(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    ).toBeVisible();
  });

  it('is labelled in Spanish for a Spanish reader', () => {
    renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={vi.fn()} />,
      { lng: 'es' },
    );

    expect(
      screen.getByRole('button', { name: 'Desistir del contrato aquí' }),
    ).toBeVisible();
    expect(screen.getByTestId('plan-withdrawal')).toHaveTextContent(
      '15 de noviembre de 2026',
    );
  });

  it('withdraws only at the second step, after saying what happens, and then says so', async () => {
    const withdraw = vi.fn().mockResolvedValue({});
    const { i18n, queryClient } = renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
    );
    const refresh = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    expect(withdraw).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        i18n!.t('settings.billing.withdrawal.explain', { name: 'Pro' }),
      ),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toHaveTextContent('Pro ends now');
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'refunded to the card',
    );

    // Keeping it withdraws nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(withdraw).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        i18n!.t('settings.billing.withdrawal.done'),
      ),
    );
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith({ queryKey: ['billingStatus'] });
  });

  it('says plainly when the 14 days have passed, with the last day', async () => {
    const withdraw = vi.fn().mockRejectedValue({
      status: 400,
      data: {
        errorCode: 'WITHDRAWAL_PERIOD_ENDED',
        details: { deadline: until },
      },
    });
    renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The 14 days to withdraw from this plan ended on November 15, 2026. You can still cancel it at the end of its period.',
      ),
    );
  });

  it('sends a plan paid from the balance to support, saying where to ask', async () => {
    const withdraw = vi.fn().mockRejectedValue({
      status: 409,
      data: { errorCode: 'WITHDRAWAL_NEEDS_SUPPORT' },
    });
    renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This plan was paid from your account balance, so our support team handles your withdrawal. Open a request on the Support page and we'll take care of it.",
      ),
    );
  });

  it('sends a plan paid from the balance to support in Spanish too', async () => {
    const withdraw = vi.fn().mockRejectedValue({
      status: 409,
      data: { errorCode: 'WITHDRAWAL_NEEDS_SUPPORT' },
    });
    renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
      { lng: 'es' },
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Desistir del contrato aquí' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sí, desistir' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('página de Soporte'),
      ),
    );
  });

  it('says so when the withdrawal fails for another reason', async () => {
    const withdraw = vi.fn().mockRejectedValue(new Error('down'));
    const { i18n } = renderWithProviders(
      <PlanWithdrawal name="Pro" until={until} withdraw={withdraw} />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Withdraw from the contract here' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, withdraw' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        i18n!.t('settings.billing.withdrawal.error'),
      ),
    );
  });
});
