import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import LiveGoalBar from './LiveGoalBar';

describe('LiveGoalBar', () => {
  it('shows nothing while there is no goal', () => {
    const { container } = renderWithProviders(
      <LiveGoalBar goal={null} onClick={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the host-supplied goal title literally', () => {
    renderWithProviders(
      <LiveGoalBar
        goal={{ title: 'Summer goal', target: 1000, current: 250 }}
      />,
    );

    expect(screen.getByText('Summer goal')).toBeInTheDocument();
    expect(screen.getByText('250/1000')).toBeInTheDocument();
  });
});
