import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PaywallOverlay from './PaywallOverlay';

describe('PaywallOverlay', () => {
  // The button shows the final price: 12.50 plus 21% VAT is 15.13.
  it.each([
    ['en', 'Unlock for €15.13'],
    ['es', 'Desbloquear por 15,13 €'],
  ] as const)('shows the price as currency in %s', (lng, label) => {
    const onUnlock = vi.fn();
    renderWithProviders(<PaywallOverlay price={12.5} onUnlock={onUnlock} />, {
      lng,
    });

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('says under the button the price before VAT and the rate', () => {
    renderWithProviders(<PaywallOverlay price={12.5} onUnlock={vi.fn()} />);

    expect(
      screen.getByText('VAT included (€12.50 + 21% VAT)'),
    ).toBeInTheDocument();
  });

  it('rounds a float price to whole cents', () => {
    renderWithProviders(
      <PaywallOverlay price={0.1 + 0.2} onUnlock={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Unlock for €0.36' }),
    ).toBeInTheDocument();
  });
});
