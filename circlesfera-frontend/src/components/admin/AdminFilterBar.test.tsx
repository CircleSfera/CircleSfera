import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdminFilterBar } from './AdminFilterBar';
import { AdminSegmentedControl } from './AdminSegmentedControl';

const control = (
  <AdminSegmentedControl
    value="all"
    onChange={() => {}}
    options={[
      { value: 'all', label: 'All' },
      { value: 'mine', label: 'Mine' },
    ]}
  />
);

describe('the option control', () => {
  it('shows its options as separate buttons with no box around them', () => {
    const { container } = render(control);

    expect(container.querySelector('.glass-panel')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'All' }).parentElement,
    ).toHaveClass('gap-2');
  });

  it('says which option is chosen', () => {
    render(control);

    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Mine' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('adds no second box inside a filter bar', () => {
    const { container } = render(<AdminFilterBar>{control}</AdminFilterBar>);

    expect(container.querySelectorAll('.glass-panel')).toHaveLength(1);
  });
});
