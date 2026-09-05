import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import SettingsDangerZone from './SettingsDangerZone';

const labels = {
  title: 'Delete account',
  description: 'This cannot be undone.',
  actionLabel: 'Delete my account',
  confirmTitle: 'Are you sure?',
  confirmBody: 'Your profile and posts will be permanently removed.',
  confirmLabel: 'Delete forever',
};

describe('SettingsDangerZone', () => {
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the zone copy without opening a dialog', () => {
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
    );

    expect(screen.getByText('Delete account')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog from the action and renders a secondary action', () => {
    renderWithProviders(
      <SettingsDangerZone
        {...labels}
        onConfirm={onConfirm}
        secondaryAction={<button type="button">Export data</button>}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Export data' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
    expect(
      screen.getByText('Your profile and posts will be permanently removed.'),
    ).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without confirming', () => {
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirms and closes the dialog', () => {
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete forever' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('disables the action while loading', () => {
    renderWithProviders(
      <SettingsDangerZone {...labels} onConfirm={onConfirm} isLoading />,
    );

    expect(
      screen.getByRole('button', { name: 'Delete my account' }),
    ).toBeDisabled();
  });
});
