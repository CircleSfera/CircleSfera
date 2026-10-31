import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import PaywallOverlay from './PaywallOverlay';

describe('PaywallOverlay', () => {
  it.each([
    ['en', 'Unlock for €12.50'],
    ['es', 'Desbloquear por 12,50 €'],
  ] as const)('shows the price as currency in %s', (lng, label) => {
    const onUnlock = vi.fn();
    renderWithProviders(<PaywallOverlay price={12.5} onUnlock={onUnlock} />, {
      lng,
    });

    fireEvent.click(screen.getByRole('button', { name: label }));

    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('says under the button that the price includes VAT', () => {
    renderWithProviders(<PaywallOverlay price={12.5} onUnlock={vi.fn()} />);

    expect(screen.getByText('VAT included')).toBeInTheDocument();
  });

  it('rounds a float price to whole cents', () => {
    renderWithProviders(
      <PaywallOverlay price={0.1 + 0.2} onUnlock={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Unlock for €0.30' }),
    ).toBeInTheDocument();
  });
});
