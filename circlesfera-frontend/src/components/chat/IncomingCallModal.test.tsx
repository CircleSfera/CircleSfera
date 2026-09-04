import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCallStore } from '../../stores/useCallStore';
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

    render(<IncomingCallModal />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the caller and a video incoming label', () => {
    mockCall();

    render(<IncomingCallModal />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Alice A')).toBeInTheDocument();
    expect(screen.getByText('Incoming video call...')).toBeInTheDocument();
    expect(screen.getByText('Decline')).toBeInTheDocument();
    expect(screen.getByText('Accept')).toBeInTheDocument();
  });

  it('shows an audio incoming label', () => {
    mockCall({ callType: 'audio' });

    render(<IncomingCallModal />);

    expect(screen.getByText('Incoming audio call...')).toBeInTheDocument();
  });

  it('accepts the call from the accept control', () => {
    mockCall();

    render(<IncomingCallModal />);
    fireEvent.click(screen.getByText('Accept'));

    expect(acceptCall).toHaveBeenCalledTimes(1);
    expect(declineCall).not.toHaveBeenCalled();
  });

  it('declines from the decline control, the dialog X, and Escape', () => {
    mockCall();

    render(<IncomingCallModal />);
    fireEvent.click(screen.getByText('Decline'));
    fireEvent.click(screen.getByRole('button', { name: /close dialog/i }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(declineCall).toHaveBeenCalledTimes(3);
    expect(acceptCall).not.toHaveBeenCalled();
  });

  it('does not decline when the overlay is clicked', () => {
    mockCall();

    render(<IncomingCallModal />);
    const overlay = screen.getByRole('dialog').parentElement;
    fireEvent.mouseDown(overlay!);

    expect(declineCall).not.toHaveBeenCalled();
  });
});
