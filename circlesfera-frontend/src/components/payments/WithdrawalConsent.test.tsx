import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { useWithdrawalConsent } from './WithdrawalConsent';

function Buy({
  onPay,
  wording,
}: {
  onPay: (given: unknown) => void;
  wording?: 'plan' | 'content';
}) {
  const consent = useWithdrawalConsent(wording);
  return (
    <>
      <button type="button" onClick={() => consent.ask(onPay)}>
        Buy
      </button>
      {consent.dialog}
    </>
  );
}

describe('useWithdrawalConsent', () => {
  it('runs the purchase only after the box is ticked, with the consent', () => {
    const onPay = vi.fn();
    renderWithProviders(<Buy onPay={onPay} />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    const box = screen.getByRole('checkbox', {
      name: /14-day right of withdrawal/,
    });
    const go = screen.getByRole('button', { name: 'Continue to payment' });
    expect(box).not.toBeChecked();
    expect(go).toBeDisabled();

    fireEvent.click(box);
    fireEvent.click(go);

    expect(onPay).toHaveBeenCalledWith({ withdrawalConsent: true });
    expect(
      screen.queryByRole('button', { name: 'Continue to payment' }),
    ).not.toBeInTheDocument();
  });

  it('for a plan asks to start now and keeps the 14-day withdrawal, paying for the part used', () => {
    const onPay = vi.fn();
    renderWithProviders(<Buy onPay={onPay} wording="plan" />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    const box = screen.getByRole('checkbox', {
      name: 'I ask for my plan to start right away. I understand that I can still withdraw within 14 days and that, if I do, I pay for the part of the plan I have already used.',
    });
    expect(
      screen.queryByRole('checkbox', { name: /lose my 14-day right/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(box);
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue to payment' }),
    );
    expect(onPay).toHaveBeenCalledWith({ withdrawalConsent: true });
  });

  it('for a plan, in Spanish, uses the Spanish wording', () => {
    renderWithProviders(<Buy onPay={vi.fn()} wording="plan" />, { lng: 'es' });

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    expect(
      screen.getByRole('checkbox', {
        name: 'Pido que mi plan empiece ya. Entiendo que puedo desistir en un plazo de 14 días y que, si lo hago, pago la parte del plan que ya haya usado.',
      }),
    ).toBeInTheDocument();
  });

  it('starts unticked every time it opens', () => {
    const onPay = vi.fn();
    renderWithProviders(<Buy onPay={onPay} />);

    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));
    fireEvent.click(
      screen.getByRole('checkbox', { name: /14-day right of withdrawal/ }),
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Buy' }));

    expect(
      screen.getByRole('checkbox', { name: /14-day right of withdrawal/ }),
    ).not.toBeChecked();
    expect(onPay).not.toHaveBeenCalled();
  });
});
