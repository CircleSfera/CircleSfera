import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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
    render(
      <MemoryRouter initialEntries={['/creator/monetization']}>
        <CreatorMoneyTab onToast={vi.fn()} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('tab', { name: /ingresos|income/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /planes|plans/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /^wallet$/i }),
    ).not.toBeInTheDocument();
  });
});
