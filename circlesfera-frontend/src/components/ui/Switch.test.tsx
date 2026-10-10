import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
  it('is named by its visible label and described by its description', () => {
    render(
      <Switch
        label="Private account"
        description="Only followers see your posts"
        checked={false}
        onChange={() => {}}
      />,
    );

    const control = screen.getByRole('checkbox', { name: 'Private account' });
    expect(control).toHaveAccessibleDescription(
      'Only followers see your posts',
    );
  });

  it('keeps the name the caller gives it', () => {
    render(
      <Switch
        label="Visible text"
        aria-label="Name for assistive technology"
        checked
        onChange={() => {}}
      />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Name for assistive technology' }),
    ).toBeChecked();
  });

  it('gives two switches on one screen their own names', () => {
    render(
      <>
        <Switch label="Comments" checked onChange={() => {}} />
        <Switch label="Likes" checked={false} onChange={() => {}} />
      </>,
    );

    expect(screen.getByRole('checkbox', { name: 'Comments' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Likes' })).not.toBeChecked();
  });

  it('reports a change when pressed, and nothing when disabled', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Switch label="Comments" checked={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Comments' }));
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender(
      <Switch label="Comments" checked={false} onChange={onChange} disabled />,
    );
    expect(screen.getByRole('checkbox', { name: 'Comments' })).toBeDisabled();
  });
});
