import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import CreatorMoneyTab, { parseSection } from './CreatorMoneyTab';

vi.mock('./CreatorMonetizationTab', () => ({
  default: ({ section }: { section: string }) => (
    <div data-testid="money-section">{section}</div>
  ),
}));

describe('CreatorMoneyTab', () => {
  it('maps the retired wallet query to income', () => {
    expect(parseSection('wallet')).toBe('income');
    expect(parseSection('plans')).toBe('plans');
    expect(parseSection(null)).toBe('income');
  });

  it('renders Income and Plans tabs only', async () => {
    const { i18n } = renderWithProviders(
      <CreatorMoneyTab onToast={vi.fn()} />,
      {
        routerProps: {
          useTransitions: false,
          initialEntries: ['/creator/monetization'],
        },
      },
    );

    expect(
      await screen.findByRole('tab', {
        name: i18n!.t('creator.money.income'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', {
        name: i18n!.t('creator.money.plans'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^wallet$/i }),
    ).not.toBeInTheDocument();
  });
});
