import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CreatorPpvIncome from './CreatorPpvIncome';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe('CreatorPpvIncome', () => {
  it('explains PPV unlocks and does not show a subscription simulator', () => {
    const onConnect = vi.fn();
    render(<CreatorPpvIncome isConnecting={false} onConnect={onConnect} />);

    expect(screen.getByText('Pay-per-view earnings')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByText(/subscribed fans/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/mo/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Connect Stripe' }));
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('hides the Connect CTA when Stripe is already linked', () => {
    render(
      <CreatorPpvIncome
        isConnecting={false}
        onConnect={vi.fn()}
        showConnect={false}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Connect Stripe' }),
    ).not.toBeInTheDocument();
  });
});
