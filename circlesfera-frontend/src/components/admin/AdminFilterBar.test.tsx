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
const boxOfControl = () =>
  screen.getByRole('button', { name: 'All' }).parentElement;

describe('the option control and the filter bar', () => {
  it('draws its own box when it stands alone', () => {
    render(control);

    expect(boxOfControl()).toHaveClass('glass-panel');
  });

  it('draws no box of its own inside a filter bar, which already has one', () => {
    const { container } = render(<AdminFilterBar>{control}</AdminFilterBar>);

    expect(boxOfControl()).not.toHaveClass('glass-panel');
    expect(container.querySelectorAll('.glass-panel')).toHaveLength(1);
  });
});
