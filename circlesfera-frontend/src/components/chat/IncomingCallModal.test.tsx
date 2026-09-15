import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallStore } from '../../stores/useCallStore';
import { renderWithProviders } from '../../test/test-utils';
import { IncomingCallModal } from './IncomingCallModal';

vi.mock('../../stores/useCallStore', () => ({
  useCallStore: vi.fn(),
}));

const acceptCall = vi.fn();
const declineCall = vi.fn();

const incomingUser = {
  id: 'user-2',
  profile: {
    username: 'alice',
    fullName: 'Alice A',
    avatar: 'https://cdn.example/alice.jpg',
  },
};

function mockCall(overrides: Record<string, unknown> = {}) {
  vi.mocked(useCallStore).mockReturnValue({
    status: 'incoming',
    remoteUser: incomingUser,
    callType: 'video',
    acceptCall,
    declineCall,
    ...overrides,
  } as never);
}

describe('IncomingCallModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('renders nothing when there is no incoming call', () => {
    mockCall({ status: 'idle', remoteUser: null, callType: null });

    renderWithProviders(<IncomingCallModal />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the caller and a video incoming label', () => {
    mockCall();

    const { i18n } = renderWithProviders(<IncomingCallModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alice A')).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('chat.incoming_video_call')),
    ).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('chat.decline'))).toBeInTheDocument();
    expect(screen.getByText(i18n!.t('chat.accept'))).toBeInTheDocument();
  });

  it('shows an audio incoming label', () => {
    mockCall({ callType: 'audio' });

    const { i18n } = renderWithProviders(<IncomingCallModal />);

    expect(
      screen.getByText(i18n!.t('chat.incoming_audio_call')),
    ).toBeInTheDocument();
  });

  it('accepts the call from the accept control', () => {
    mockCall();

    const { i18n } = renderWithProviders(<IncomingCallModal />);
    fireEvent.click(screen.getByText(i18n!.t('chat.accept')));

    expect(acceptCall).toHaveBeenCalledTimes(1);
    expect(declineCall).not.toHaveBeenCalled();
  });

  it('declines from the decline control, the dialog X, and Escape', () => {
    mockCall();

    const { i18n } = renderWithProviders(<IncomingCallModal />);
    fireEvent.click(screen.getByText(i18n!.t('chat.decline')));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(declineCall).toHaveBeenCalledTimes(3);
    expect(acceptCall).not.toHaveBeenCalled();
  });

  it('does not decline when the overlay is clicked', () => {
    mockCall();

    renderWithProviders(<IncomingCallModal />);
    const overlay = screen.getByRole('dialog').parentElement;
    fireEvent.mouseDown(overlay!);

    expect(declineCall).not.toHaveBeenCalled();
  });
});
