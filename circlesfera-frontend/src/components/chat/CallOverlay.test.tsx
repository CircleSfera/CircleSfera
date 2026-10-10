import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webrtcService } from '../../services/webrtc.service';
import { useSocketStore } from '../../stores/socketStore';
import { useCallStore } from '../../stores/useCallStore';
import { renderWithProviders } from '../../test/test-utils';
import { CallOverlay } from './CallOverlay';

vi.mock('../../services/webrtc.service', () => ({
  webrtcService: {
    cleanup: vi.fn(),
    startScreenShare: vi.fn(),
    stopScreenShare: vi.fn(),
  },
}));

const emit = vi.fn();
const ana = { id: 'u-ana', profile: { username: 'ana' } };

describe('CallOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    useSocketStore.setState({ socket: { emit } as never });
    useCallStore.getState().resetCall();
  });

  it('shows nothing when there is no call', () => {
    const { container } = renderWithProviders(<CallOverlay />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hanging up closes the connection and stops capture before freeing the line, and tells the other person', () => {
    useCallStore.setState({
      status: 'active',
      callType: 'video',
      remoteUser: ana,
    });
    const order: string[] = [];
    vi.mocked(webrtcService.cleanup).mockImplementation(() => {
      order.push(`cleanup while ${useCallStore.getState().status}`);
    });
    emit.mockImplementation((name: string) => order.push(name));
    const { i18n } = renderWithProviders(<CallOverlay />);

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('chat.end_call') }),
    );

    expect(order).toEqual(['cleanup while active', 'call:hangup']);
    expect(emit).toHaveBeenCalledWith('call:hangup', { targetId: 'u-ana' });
    expect(useCallStore.getState().status).toBe('idle');
  });
});
