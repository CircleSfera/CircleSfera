import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webrtcService } from '../services/webrtc.service';
import { useSocketStore } from '../stores/socketStore';
import { type CallUser, useCallStore } from '../stores/useCallStore';
import { useCallListeners } from './useCallListeners';

vi.mock('../services/webrtc.service', () => ({
  webrtcService: {
    startCall: vi.fn(),
    handleOffer: vi.fn(),
    handleAnswer: vi.fn(),
    addIceCandidate: vi.fn(),
    cleanup: vi.fn(),
  },
}));
vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

const ana: CallUser = { id: 'u-ana', profile: { username: 'ana' } };
const handlers = new Map<string, (payload: never) => unknown>();
const socket = {
  emit: vi.fn(),
  on: vi.fn((name: string, run: (payload: never) => unknown) => {
    handlers.set(name, run);
  }),
  // Removed only when it is the same listener that was added: removing
  // another one would leave the real one in place.
  off: vi.fn((name: string, run: (payload: never) => unknown) => {
    if (handlers.get(name) === run) handlers.delete(name);
  }),
};
const receive = (name: string, payload: unknown = {}) =>
  handlers.get(name)?.(payload as never);

describe('useCallListeners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    useSocketStore.setState({ socket: socket as never });
    useCallStore.getState().resetCall();
  });

  it('listens for calls while connected, and stops when it is removed', () => {
    const { unmount } = renderHook(() => useCallListeners());
    expect([...handlers.keys()].sort()).toEqual([
      'call:accepted',
      'call:declined',
      'call:ended',
      'call:incoming',
      'call:signal',
    ]);

    unmount();
    expect(handlers.size).toBe(0);
  });

  it('listens for nothing without a connection', () => {
    useSocketStore.setState({ socket: null });
    renderHook(() => useCallListeners());
    expect(socket.on).not.toHaveBeenCalled();
  });

  it('shows an incoming call when the line is free, and ignores it during another call', () => {
    renderHook(() => useCallListeners());

    receive('call:incoming', { caller: ana, type: 'video' });
    expect(useCallStore.getState()).toMatchObject({
      status: 'incoming',
      remoteUser: ana,
      callType: 'video',
    });

    receive('call:incoming', {
      caller: { id: 'u-luis', profile: { username: 'luis' } },
      type: 'audio',
    });
    expect(useCallStore.getState().remoteUser).toBe(ana);
  });

  it('opens the connection with the other person once they answer', async () => {
    renderHook(() => useCallListeners());
    useCallStore.setState({ status: 'ringing', callType: 'audio' });

    await receive('call:accepted', { receiverId: 'u-ana' });

    expect(useCallStore.getState().status).toBe('active');
    expect(webrtcService.startCall).toHaveBeenCalledWith('u-ana', 'audio');
  });

  it('hands each signal of the connection to the right step', async () => {
    renderHook(() => useCallListeners());

    await receive('call:signal', {
      signal: { type: 'offer', sdp: 'offer-sdp' },
      fromId: 'u-ana',
    });
    expect(webrtcService.handleOffer).toHaveBeenCalledWith(
      { type: 'offer', sdp: 'offer-sdp' },
      'u-ana',
    );

    await receive('call:signal', {
      signal: { type: 'answer', sdp: 'answer-sdp' },
      fromId: 'u-ana',
    });
    expect(webrtcService.handleAnswer).toHaveBeenCalledWith({
      type: 'answer',
      sdp: 'answer-sdp',
    });

    const candidate = { candidate: 'c', sdpMid: '0' };
    await receive('call:signal', {
      signal: { type: 'candidate', candidate },
      fromId: 'u-ana',
    });
    expect(webrtcService.addIceCandidate).toHaveBeenCalledWith(candidate);
  });

  it('ignores a signal that carries nothing to act on', async () => {
    renderHook(() => useCallListeners());

    await receive('call:signal', { signal: { type: 'offer' }, fromId: 'u' });
    await receive('call:signal', { signal: { type: 'answer' }, fromId: 'u' });
    await receive('call:signal', {
      signal: { type: 'candidate' },
      fromId: 'u',
    });
    await receive('call:signal', { signal: { type: 'other' }, fromId: 'u' });

    expect(webrtcService.handleOffer).not.toHaveBeenCalled();
    expect(webrtcService.handleAnswer).not.toHaveBeenCalled();
    expect(webrtcService.addIceCandidate).not.toHaveBeenCalled();
  });

  it.each(['call:ended', 'call:declined'])(
    'closes the connection and frees the line on %s',
    (name) => {
      renderHook(() => useCallListeners());
      useCallStore.setState({ status: 'active', remoteUser: ana });

      receive(name);

      expect(webrtcService.cleanup).toHaveBeenCalled();
      expect(useCallStore.getState()).toMatchObject({
        status: 'idle',
        remoteUser: null,
      });
    },
  );
});
