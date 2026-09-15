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
    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    expect(
      screen.getByText(
        i18n!.t('mute.title', 'Mute {{username}}', { username: 'alice' }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('mute.subtitle'))).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('mute.duration.24h'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('mute.duration.7d'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('mute.duration.30d'),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: i18n!.t('mute.duration.forever'),
      }),
    ).toBeInTheDocument();
  });

  it('closes from cancel and the dialog X without muting', () => {
    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('common.cancel'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(followsApi.mute).not.toHaveBeenCalled();
    expect(onMuted).not.toHaveBeenCalled();
  });

  it('mutes forever by default and notifies the parent', async () => {
    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('mute.confirm') }),
    );

    await waitFor(() => {
      expect(followsApi.mute).toHaveBeenCalledWith('alice', 'forever');
    });
    expect(toast.success).toHaveBeenCalledWith(i18n!.t('mute.success'));
    expect(onMuted).toHaveBeenCalledWith('forever');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends the selected duration', async () => {
    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n!.t('mute.duration.7d'),
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('mute.confirm') }),
    );

    await waitFor(() => {
      expect(followsApi.mute).toHaveBeenCalledWith('alice', '7d');
    });
    expect(onMuted).toHaveBeenCalledWith('7d');
  });

  it('does not call mute without a username', async () => {
    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username=""
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('mute.confirm') }),
    );

    await waitFor(() => {
      expect(followsApi.mute).not.toHaveBeenCalled();
    });
    expect(onMuted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('toasts on failure and stays open', async () => {
    vi.mocked(followsApi.mute).mockRejectedValueOnce(new Error('denied'));

    const { i18n } = renderWithProviders(
      <MuteDurationModal
        isOpen
        username="alice"
        onClose={onClose}
        onMuted={onMuted}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('mute.confirm') }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(i18n!.t('mute.error'));
    });
    expect(onMuted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
