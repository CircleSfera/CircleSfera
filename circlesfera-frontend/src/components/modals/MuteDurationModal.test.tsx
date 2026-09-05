import { fireEvent, screen, waitFor } from '@testing-library/react';
import toast from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { followsApi } from '../../services';
import { renderWithProviders } from '../../test/test-utils';
import MuteDurationModal from './MuteDurationModal';

vi.mock('../../services', () => ({
  followsApi: {
    mute: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

describe('MuteDurationModal', () => {
  const onClose = vi.fn();
  const onMuted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(followsApi.mute).mockResolvedValue({
      success: true,
      expiresAt: null,
    } as never);
  });

  it('renders nothing when closed', () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen={false}
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(followsApi.mute).not.toHaveBeenCalled();
  });

  it('shows the username and duration options', () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    expect(screen.getByText('Mute alice')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Their posts will be hidden from your feed. They will not be notified.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '24 hours' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Forever' })).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without muting', () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(followsApi.mute).not.toHaveBeenCalled();
    expect(onMuted).not.toHaveBeenCalled();
  });

  it('mutes forever by default and notifies the parent', async () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    await waitFor(() => {
      expect(followsApi.mute).toHaveBeenCalledWith('alice', 'forever');
    });
    expect(toast.success).toHaveBeenCalledWith('User muted');
    expect(onMuted).toHaveBeenCalledWith('forever');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends the selected duration', async () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    await waitFor(() => {
      expect(followsApi.mute).toHaveBeenCalledWith('alice', '7d');
    });
    expect(onMuted).toHaveBeenCalledWith('7d');
  });

  it('does not call mute without a username', async () => {
    renderWithProviders(
      <MuteDurationModal
        isOpen
        username=""
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    await waitFor(() => {
      expect(followsApi.mute).not.toHaveBeenCalled();
    });
    expect(onMuted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('toasts on failure and stays open', async () => {
    vi.mocked(followsApi.mute).mockRejectedValueOnce(new Error('denied'));

    renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to mute user');
    });
    expect(onMuted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
