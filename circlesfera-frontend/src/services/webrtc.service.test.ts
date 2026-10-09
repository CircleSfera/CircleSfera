import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services';
import { useSocketStore } from '../stores/socketStore';
import { useCallStore } from '../stores/useCallStore';
import { webrtcService } from './webrtc.service';

vi.mock('../services', () => ({ api: { get: vi.fn() } }));
vi.mock('../utils/logger', () => ({
  logger: { log: vi.fn(), error: vi.fn() },
}));

type Track = {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
  onended?: () => void;
};
const track = (kind: string): Track => ({ kind, stop: vi.fn() });

// A set of tracks, as the browser hands the camera, the microphone or a screen.
class FakeStream {
  tracks: Track[];
  constructor(tracks: Track[] = []) {
    this.tracks = [...tracks];
  }
  getTracks = () => this.tracks;
  getAudioTracks = () => this.tracks.filter((t) => t.kind === 'audio');
  getVideoTracks = () => this.tracks.filter((t) => t.kind === 'video');
  addTrack = (added: Track) => {
    this.tracks.push(added);
  };
}

// The connection between the two people, reduced to what the service drives.
class FakeConnection {
  static last: FakeConnection;
  config: RTCConfiguration;
  connectionState = 'new';
  remoteDescription: { type?: string } | null = null;
  senders: { track: Track; replaceTrack: ReturnType<typeof vi.fn> }[] = [];
  addIceCandidate = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  ontrack: ((e: { streams?: FakeStream[]; track: Track }) => void) | null =
    null;
  onconnectionstatechange: (() => void) | null = null;
  constructor(config: RTCConfiguration) {
    this.config = config;
    FakeConnection.last = this;
  }
  addTrack = (added: Track) => {
    this.senders.push({ track: added, replaceTrack: vi.fn() });
  };
  getSenders = () => this.senders;
  createOffer = async () => ({ type: 'offer', sdp: 'offer-sdp' });
  createAnswer = async () => ({ type: 'answer', sdp: 'answer-sdp' });
  setLocalDescription = vi.fn();
  setRemoteDescription = vi.fn(async (description: { type: string }) => {
    this.remoteDescription = description;
  });
}

const emit = vi.fn();
const getUserMedia = vi.fn();
const getDisplayMedia = vi.fn();
const call = () => useCallStore.getState();

describe('webrtcService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('RTCPeerConnection', FakeConnection);
    vi.stubGlobal('MediaStream', FakeStream);
    vi.stubGlobal(
      'RTCSessionDescription',
      class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
    );
    vi.stubGlobal(
      'RTCIceCandidate',
      class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
    );
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia, getDisplayMedia },
    });
    getUserMedia.mockImplementation(
      async ({ video }: { video: boolean }) =>
        new FakeStream([track('audio'), ...(video ? [track('video')] : [])]),
    );
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
    useSocketStore.setState({ socket: { emit } as never });
    call().resetCall();
    webrtcService.cleanup();
  });
  afterEach(() => {
    webrtcService.cleanup();
    vi.unstubAllGlobals();
  });

  describe('starting a call', () => {
    it('asks for the microphone and, for a video call, the camera, and sends the offer', async () => {
      await webrtcService.startCall('u-ana', 'video');

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
      expect(FakeConnection.last.senders.map((s) => s.track.kind)).toEqual([
        'audio',
        'video',
      ]);
      expect(call().localStream).not.toBeNull();
      expect(emit).toHaveBeenCalledWith('call:signal', {
        targetId: 'u-ana',
        signal: { type: 'offer', sdp: 'offer-sdp' },
      });
    });

    it('asks for no camera on an audio call', async () => {
      await webrtcService.startCall('u-ana', 'audio');
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    });

    it('uses the relay servers the product gives, and its fallback when it gives none or fails', async () => {
      const servers = [{ urls: 'turn:relay.example', username: 'u' }];
      vi.mocked(api.get).mockResolvedValueOnce({ data: servers } as never);
      await webrtcService.startCall('u-ana', 'audio');
      expect(api.get).toHaveBeenCalledWith('/webrtc/ice-servers');
      expect(FakeConnection.last.config.iceServers).toEqual(servers);

      vi.mocked(api.get).mockRejectedValueOnce(new Error('down'));
      await webrtcService.startCall('u-ana', 'audio');
      // The last servers that worked are kept.
      expect(FakeConnection.last.config.iceServers).toEqual(servers);
    });

    it('when the microphone is refused: frees the line, tells the other person and reports the failure', async () => {
      getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
      useCallStore.setState({ status: 'ringing' });

      await expect(webrtcService.startCall('u-ana', 'audio')).rejects.toThrow(
        'NotAllowedError',
      );

      expect(FakeConnection.last.close).toHaveBeenCalled();
      expect(call().status).toBe('idle');
      expect(emit).toHaveBeenCalledWith('call:hangup', { targetId: 'u-ana' });
    });
  });

  describe('answering a call', () => {
    it('takes the offer and sends the answer, with the camera only for a video call', async () => {
      useCallStore.setState({ callType: 'video' });

      await webrtcService.handleOffer(
        { type: 'offer', sdp: 'their-offer' },
        'u-ana',
      );

      expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: true });
      expect(FakeConnection.last.setRemoteDescription).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'their-offer' }),
      );
      expect(emit).toHaveBeenCalledWith('call:signal', {
        targetId: 'u-ana',
        signal: { type: 'answer', sdp: 'answer-sdp' },
      });
    });

    it('when the microphone is refused: frees the line and tells the caller, without throwing', async () => {
      getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
      useCallStore.setState({ status: 'active', callType: 'audio' });

      await expect(
        webrtcService.handleOffer({ type: 'offer', sdp: 'x' }, 'u-ana'),
      ).resolves.toBeUndefined();

      expect(call().status).toBe('idle');
      expect(emit).toHaveBeenCalledWith('call:decline', { callerId: 'u-ana' });
    });
  });

  describe('the route between the two people', () => {
    const candidate = { candidate: 'route-1', sdpMid: '0' };

    it('keeps a route that arrives before the answer and adds it once the answer is in', async () => {
      await webrtcService.startCall('u-ana', 'audio');
      const connection = FakeConnection.last;

      await webrtcService.addIceCandidate(candidate);
      expect(connection.addIceCandidate).not.toHaveBeenCalled();

      await webrtcService.handleAnswer({ type: 'answer', sdp: 'their-answer' });
      await Promise.resolve();
      expect(connection.addIceCandidate).toHaveBeenCalledWith(
        expect.objectContaining(candidate),
      );

      await webrtcService.addIceCandidate({ candidate: 'route-2' });
      expect(connection.addIceCandidate).toHaveBeenCalledTimes(2);
    });

    it('goes on when a route cannot be added', async () => {
      await webrtcService.startCall('u-ana', 'audio');
      await webrtcService.handleAnswer({ type: 'answer', sdp: 'x' });
      FakeConnection.last.addIceCandidate.mockRejectedValueOnce(
        new Error('bad'),
      );

      await expect(
        webrtcService.addIceCandidate(candidate),
      ).resolves.toBeUndefined();
    });

    it('does nothing with an answer or a route when there is no call', async () => {
      await expect(
        webrtcService.handleAnswer({ type: 'answer', sdp: 'x' }),
      ).resolves.toBeUndefined();
      await expect(
        webrtcService.addIceCandidate(candidate),
      ).resolves.toBeUndefined();
    });

    it('sends its own routes to the other person', async () => {
      await webrtcService.startCall('u-ana', 'audio');
      emit.mockClear();

      FakeConnection.last.onicecandidate?.({ candidate });
      FakeConnection.last.onicecandidate?.({ candidate: null });

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('call:signal', {
        targetId: 'u-ana',
        signal: { type: 'candidate', candidate },
      });
    });
  });

  describe('what arrives from the other person', () => {
    it('shows their sound and picture, as a new stream each time so the screen updates', async () => {
      await webrtcService.startCall('u-ana', 'video');
      const theirs = new FakeStream([track('audio')]);

      FakeConnection.last.ontrack?.({
        streams: [theirs],
        track: theirs.tracks[0],
      });
      const first = call().remoteStream as unknown as FakeStream;
      expect(first).not.toBe(theirs);
      expect(first.getTracks()).toHaveLength(1);

      // A track that arrives with no stream joins the one already shown.
      FakeConnection.last.ontrack?.({ streams: [], track: track('video') });
      const second = call().remoteStream as unknown as FakeStream;
      expect(second).not.toBe(first);
      expect(second.getTracks().map((t) => t.kind)).toEqual(['audio', 'video']);
    });

    it.each(['disconnected', 'failed', 'closed'])(
      'frees the line when the connection is %s',
      async (state) => {
        await webrtcService.startCall('u-ana', 'audio');
        useCallStore.setState({ status: 'active' });

        FakeConnection.last.connectionState = 'connected';
        FakeConnection.last.onconnectionstatechange?.();
        expect(call()).toMatchObject({
          status: 'active',
          connectionStatus: 'connected',
        });

        FakeConnection.last.connectionState = state;
        FakeConnection.last.onconnectionstatechange?.();
        expect(call().status).toBe('idle');
      },
    );

    it.each(['disconnected', 'failed', 'closed'])(
      'closes the connection and stops the camera, the microphone and a shared screen when it is %s',
      async (state) => {
        await webrtcService.startCall('u-ana', 'video');
        const connection = FakeConnection.last;
        const mine = connection.senders.map((s) => s.track);
        const shared = track('video');
        getDisplayMedia.mockResolvedValue(new FakeStream([shared]));
        await webrtcService.startScreenShare();

        connection.connectionState = state;
        connection.onconnectionstatechange?.();

        expect(connection.close).toHaveBeenCalled();
        for (const one of [...mine, shared]) {
          expect(one.stop).toHaveBeenCalled();
        }
        expect(call()).toMatchObject({
          status: 'idle',
          isScreenSharing: false,
          localStream: null,
        });
      },
    );
  });

  describe('sharing the screen', () => {
    const screen = () => {
      const shared = track('video');
      getDisplayMedia.mockResolvedValue(new FakeStream([shared]));
      return shared;
    };

    it('sends the screen instead of the camera, keeps the sound, and goes back to the camera', async () => {
      await webrtcService.startCall('u-ana', 'video');
      const camera = FakeConnection.last.senders[1];
      const shared = screen();

      await webrtcService.startScreenShare();
      expect(camera.replaceTrack).toHaveBeenCalledWith(shared);
      expect(call().isScreenSharing).toBe(true);
      expect(
        (call().localStream as unknown as FakeStream)
          .getTracks()
          .map((t) => t.kind),
      ).toEqual(['video', 'audio']);

      await webrtcService.stopScreenShare();
      expect(camera.replaceTrack).toHaveBeenLastCalledWith(camera.track);
      expect(shared.stop).toHaveBeenCalled();
      expect(call().isScreenSharing).toBe(false);
    });

    it('goes back to the camera when sharing is stopped from the browser', async () => {
      await webrtcService.startCall('u-ana', 'video');
      const shared = screen();
      await webrtcService.startScreenShare();

      shared.onended?.();
      await Promise.resolve();
      await Promise.resolve();

      expect(call().isScreenSharing).toBe(false);
    });

    it('does not ask the browser for the screen with no call, nor on an audio call, where there is no camera to replace', async () => {
      await webrtcService.startScreenShare();
      await webrtcService.stopScreenShare();
      expect(getDisplayMedia).not.toHaveBeenCalled();

      await webrtcService.startCall('u-ana', 'audio');
      screen();
      await webrtcService.startScreenShare();

      expect(getDisplayMedia).not.toHaveBeenCalled();
      expect(call().isScreenSharing).toBe(false);
    });

    it('changes nothing when the person cancels the choice of screen', async () => {
      await webrtcService.startCall('u-ana', 'video');
      getDisplayMedia.mockRejectedValueOnce(new Error('cancelled'));

      await expect(webrtcService.startScreenShare()).resolves.toBeUndefined();

      expect(call().isScreenSharing).toBe(false);
      expect(
        FakeConnection.last.senders[1].replaceTrack,
      ).not.toHaveBeenCalled();
    });
  });

  it('ending a call closes the connection and stops the camera, the microphone and the shared screen', async () => {
    await webrtcService.startCall('u-ana', 'video');
    const connection = FakeConnection.last;
    const mine = connection.senders.map((s) => s.track);
    const shared = track('video');
    getDisplayMedia.mockResolvedValue(new FakeStream([shared]));
    await webrtcService.startScreenShare();

    webrtcService.cleanup();

    expect(connection.close).toHaveBeenCalled();
    for (const one of [...mine, shared]) expect(one.stop).toHaveBeenCalled();
    // Nothing is left to act on.
    await webrtcService.addIceCandidate({ candidate: 'late' });
    expect(connection.addIceCandidate).not.toHaveBeenCalled();
  });
});
