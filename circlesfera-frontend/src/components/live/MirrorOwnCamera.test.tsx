import { act, render, waitFor } from '@testing-library/react';
import { LocalVideoTrack } from 'livekit-client';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { MirrorOwnCamera } from './MirrorOwnCamera';

const { local, Mirror } = vi.hoisted(() => ({
  local: { cameraTrack: undefined as unknown },
  Mirror: class {
    static supported: Mock<() => boolean> = vi.fn(() => true);
    name = 'mirror-camera';
  },
}));
const supported = Mirror.supported;

vi.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => local,
}));

vi.mock('livekit-client', () => ({ LocalVideoTrack: class {} }));

vi.mock('./mirrorCamera', () => ({ MirrorCamera: Mirror }));

const { logger } = vi.hoisted(() => ({ logger: { error: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger }));

function cameraOnAir(processor?: unknown) {
  let current = processor;
  const videoTrack = Object.assign(Object.create(LocalVideoTrack.prototype), {
    getProcessor: () => current,
    setProcessor: vi.fn((next: unknown) => {
      current = next;
      return Promise.resolve();
    }),
    stopProcessor: vi.fn(() => {
      current = undefined;
      return Promise.resolve();
    }),
  });
  local.cameraTrack = { videoTrack };
  return videoTrack;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function pageGoes(state: DocumentVisibilityState) {
  setVisibility(state);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('MirrorOwnCamera', () => {
  beforeEach(() => {
    setVisibility('visible');
    local.cameraTrack = undefined;
    supported.mockReturnValue(true);
    logger.error.mockClear();
  });

  it('does nothing while the camera is not on air', () => {
    expect(() => render(<MirrorOwnCamera />)).not.toThrow();
  });

  it("leaves alone a camera that is someone else's", () => {
    const remote = { setProcessor: vi.fn() };
    local.cameraTrack = { videoTrack: remote };
    render(<MirrorOwnCamera />);

    expect(remote.setProcessor).not.toHaveBeenCalled();
  });

  it("puts the mirror on this person's own camera once it is on air", () => {
    const track = cameraOnAir();
    render(<MirrorOwnCamera />);

    expect(track.setProcessor).toHaveBeenCalledTimes(1);
    expect(track.setProcessor.mock.calls[0]).toEqual([
      expect.objectContaining({ name: 'mirror-camera' }),
    ]);
  });

  it('does not put it twice', () => {
    const track = cameraOnAir({ name: 'mirror-camera' });
    render(<MirrorOwnCamera />);

    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('sends the camera as it is where the browser cannot mirror it', () => {
    supported.mockReturnValue(false);
    const track = cameraOnAir();
    render(<MirrorOwnCamera />);

    expect(track.setProcessor).not.toHaveBeenCalled();
  });

  it('keeps the camera on air when the mirror fails', async () => {
    const track = cameraOnAir();
    track.setProcessor.mockReturnValueOnce(Promise.reject(new Error('no')));
    render(<MirrorOwnCamera />);

    await waitFor(() => expect(logger.error).toHaveBeenCalled());
  });

  it('sends the camera as it is while the page is out of sight, and mirrors it again on return', () => {
    const track = cameraOnAir();
    render(<MirrorOwnCamera />);
    expect(track.setProcessor).toHaveBeenCalledTimes(1);

    pageGoes('hidden');
    expect(track.stopProcessor).toHaveBeenCalledTimes(1);
    expect(track.getProcessor()).toBeUndefined();

    pageGoes('visible');
    expect(track.setProcessor).toHaveBeenCalledTimes(2);
  });

  it('leaves alone a processor that is not the mirror when the page hides', () => {
    const track = cameraOnAir({ name: 'other' });
    render(<MirrorOwnCamera />);

    pageGoes('hidden');
    expect(track.stopProcessor).not.toHaveBeenCalled();
  });
});
