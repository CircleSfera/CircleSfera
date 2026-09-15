import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CreatorPpvIncome from './CreatorPpvIncome';

describe('CreatorPpvIncome', () => {
  it('explains PPV unlocks and does not show a subscription simulator', () => {
    const onConnect = vi.fn();
    const { i18n } = renderWithProviders(
      <CreatorPpvIncome isConnecting={false} onConnect={onConnect} />,
    );

    expect(screen.getByText(i18n!.t('creator.ppv.title'))).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.queryByText(/subscribed fans/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/mo/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('creator.ppv.connect'),
      }),
    );
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('hides the Connect CTA when Stripe is already linked', () => {
    const { i18n } = renderWithProviders(
      <CreatorPpvIncome
        isConnecting={false}
        onConnect={vi.fn()}
        showConnect={false}
      />,
    );
    expect(
      screen.queryByRole('button', {
        name: i18n!.t('creator.ppv.connect'),
      }),
    ).not.toBeInTheDocument();
  });
});
