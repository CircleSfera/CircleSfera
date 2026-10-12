import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AdminSegmentedControl } from './AdminSegmentedControl';

const options = [
  { value: 'rules', label: 'Rules' },
  { value: 'signatures', label: 'Signatures' },
];

// A section that draws the choice inside the view it changes.
function TwoViews() {
  const [view, setView] = useState('rules');
  const choice = (
    <AdminSegmentedControl options={options} value={view} onChange={setView} />
  );
  return view === 'rules' ? (
    <section aria-label="rules view">{choice}</section>
  ) : (
    <article aria-label="signatures view">{choice}</article>
  );
}

describe('AdminSegmentedControl', () => {
  it('marks the chosen option and reports a press', () => {
    const chosen: string[] = [];
    render(
      <AdminSegmentedControl
        options={options}
        value="rules"
        onChange={(next) => chosen.push(next)}
      />,
    );

    expect(screen.getByRole('button', { name: 'Rules' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Signatures' }));
    expect(chosen).toEqual(['signatures']);
  });

  it('keeps the focus on the chosen option when its view is replaced', () => {
    render(<TwoViews />);

    const before = screen.getByRole('button', { name: 'Signatures' });
    before.focus();
    fireEvent.click(before);

    const after = screen.getByRole('button', { name: 'Signatures' });
    expect(after).not.toBe(before);
    expect(after).toHaveAttribute('aria-pressed', 'true');
    expect(after).toHaveFocus();
  });
});
