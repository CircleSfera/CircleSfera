import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import LiveGoalBar from './LiveGoalBar';

describe('LiveGoalBar', () => {
  it('labels add-goal from the catalog for hosts', () => {
    const { i18n } = renderWithProviders(
      <LiveGoalBar goal={null} isHost onClick={vi.fn()} />,
    );

    expect(i18n!.t('live.goal.add')).toBe('Add goal');
    expect(
      screen.getByRole('button', { name: i18n!.t('live.goal.add') }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Añadir Objetivo')).not.toBeInTheDocument();
  });

  it('uses the Spanish add-goal label', () => {
    const { i18n } = renderWithProviders(
      <LiveGoalBar goal={null} isHost onClick={vi.fn()} />,
      { lng: 'es' },
    );

    expect(i18n!.t('live.goal.add')).toBe('Añadir Objetivo');
    expect(
      screen.getByRole('button', { name: i18n!.t('live.goal.add') }),
    ).toBeInTheDocument();
  });

  it('renders the host-supplied goal title literally', () => {
    renderWithProviders(
      <LiveGoalBar
        goal={{ title: 'Summer goal', target: 1000, current: 250 }}
        isHost
      />,
    );

    expect(screen.getByText('Summer goal')).toBeInTheDocument();
    expect(screen.getByText('250/1000')).toBeInTheDocument();
  });
});
