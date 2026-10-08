import { fireEvent, screen } from '@testing-library/react';
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

  it('switches between income and plans and marks the open one', async () => {
    const { i18n } = renderWithProviders(
      <CreatorMoneyTab onToast={vi.fn()} />,
      {
        routerProps: {
          useTransitions: false,
          initialEntries: ['/creator/monetization'],
        },
      },
    );
    const income = await screen.findByRole('tab', {
      name: i18n!.t('creator.money.income'),
    });
    const plans = screen.getByRole('tab', {
      name: i18n!.t('creator.money.plans'),
    });
    expect(await screen.findByTestId('money-section')).toHaveTextContent(
      'income',
    );
    expect(income).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(plans);
    expect(screen.getByTestId('money-section')).toHaveTextContent('plans');
    expect(plans).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(income);
    expect(screen.getByTestId('money-section')).toHaveTextContent('income');
  });

  it('opens plans from the address and income from the retired wallet address', async () => {
    const first = renderWithProviders(<CreatorMoneyTab onToast={vi.fn()} />, {
      routerProps: {
        useTransitions: false,
        initialEntries: ['/creator/monetization?section=plans'],
      },
    });
    expect(await screen.findByTestId('money-section')).toHaveTextContent(
      'plans',
    );
    first.unmount();

    renderWithProviders(<CreatorMoneyTab onToast={vi.fn()} />, {
      routerProps: {
        useTransitions: false,
        initialEntries: ['/creator/monetization?section=wallet'],
      },
    });
    expect(await screen.findByTestId('money-section')).toHaveTextContent(
      'income',
    );
  });
});
