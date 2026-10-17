import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import { useWithdrawalConsent } from './WithdrawalConsent';

function Buy({ onPay }: { onPay: (given: unknown) => void }) {
  const consent = useWithdrawalConsent();
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
