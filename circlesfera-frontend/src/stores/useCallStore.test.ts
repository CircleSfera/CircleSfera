import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSocketStore } from './socketStore';
import { type CallUser, useCallStore } from './useCallStore';

const emit = vi.fn();
const ana: CallUser = { id: 'u-ana', profile: { username: 'ana' } };
const luis: CallUser = { id: 'u-luis', profile: { username: 'luis' } };
const call = () => useCallStore.getState();
const connect = (connected = true) =>
  useSocketStore.setState({
    socket: connected ? ({ emit } as never) : null,
  });

describe('useCallStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connect();
    call().resetCall();
  });

  it('starts idle, with nobody on the line', () => {
    expect(call()).toMatchObject({
      status: 'idle',
      callType: null,
      remoteUser: null,
      localStream: null,
      remoteStream: null,
      isScreenSharing: false,
      connectionStatus: 'new',
    });
  });

  it('rings the other person when a call is started', () => {
    call().initiateCall('u-ana', 'video', ana);

    expect(call()).toMatchObject({
      status: 'ringing',
      callType: 'video',
      remoteUser: ana,
    });
    expect(emit).toHaveBeenCalledWith('call:invite', {
      recipientId: 'u-ana',
      type: 'video',
    });
  });

  it('starts no call without a connection', () => {
    connect(false);
    call().initiateCall('u-ana', 'audio', ana);

    expect(call().status).toBe('idle');
    expect(emit).not.toHaveBeenCalled();
  });

  it('shows an incoming call, and answering it tells the caller', () => {
    call().setIncomingCall(ana, 'audio');
    expect(call()).toMatchObject({
      status: 'incoming',
      remoteUser: ana,
      callType: 'audio',
    });

    call().acceptCall();
    expect(call().status).toBe('active');
    expect(emit).toHaveBeenCalledWith('call:accept', { callerId: 'u-ana' });
  });

  it('declines a second call while one is going on, and keeps the first', () => {
    call().setIncomingCall(ana, 'audio');
    call().acceptCall();
    emit.mockClear();

    call().setIncomingCall(luis, 'video');

    expect(emit).toHaveBeenCalledWith('call:decline', { callerId: 'u-luis' });
    expect(call()).toMatchObject({ status: 'active', remoteUser: ana });
  });

  it('answers nothing when nobody is calling, or without a connection', () => {
    call().acceptCall();
    expect(call().status).toBe('idle');

    call().setIncomingCall(ana, 'audio');
    connect(false);
    call().acceptCall();
    expect(call().status).toBe('incoming');
    expect(emit).not.toHaveBeenCalled();
  });

  it('declining tells the caller and frees the line', () => {
    call().setIncomingCall(ana, 'audio');
    call().declineCall();

    expect(emit).toHaveBeenCalledWith('call:decline', { callerId: 'u-ana' });
    expect(call()).toMatchObject({ status: 'idle', remoteUser: null });
  });

  it('hanging up tells the other person, stops the camera and the microphone, and frees the line', () => {
    const stop = vi.fn();
    call().initiateCall('u-ana', 'video', ana);
    call().setLocalStream({
      getTracks: () => [{ stop }, { stop }],
    } as never);
    call().setRemoteStream({} as never);
    call().setIsScreenSharing(true);
    call().setConnectionStatus('connected');

    call().endCall();

    expect(emit).toHaveBeenCalledWith('call:hangup', { targetId: 'u-ana' });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(call()).toMatchObject({
      status: 'idle',
      callType: null,
      remoteUser: null,
      localStream: null,
      remoteStream: null,
      isScreenSharing: false,
      connectionStatus: 'new',
    });
  });

  it('frees the line even when the connection is gone', () => {
    call().initiateCall('u-ana', 'audio', ana);
    emit.mockClear();
    connect(false);

    call().endCall();
    expect(call().status).toBe('idle');
    call().declineCall();
    expect(emit).not.toHaveBeenCalled();
  });
});
