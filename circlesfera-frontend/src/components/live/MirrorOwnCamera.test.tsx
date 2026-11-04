import { render, waitFor } from '@testing-library/react';
import { LocalVideoTrack } from 'livekit-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MirrorOwnCamera } from './MirrorOwnCamera';

const { local, supported } = vi.hoisted(() => ({
  local: { cameraTrack: undefined as unknown },
  supported: vi.fn(() => true),
}));

vi.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => local,
}));

vi.mock('livekit-client', () => ({ LocalVideoTrack: class {} }));

vi.mock('./mirrorCamera', () => ({
  MirrorCamera: class {
    static supported = supported;
    name = 'mirror-camera';
  },
}));

const { logger } = vi.hoisted(() => ({ logger: { error: vi.fn() } }));
vi.mock('../../utils/logger', () => ({ logger }));

function cameraOnAir(processor?: unknown) {
  const videoTrack = Object.assign(Object.create(LocalVideoTrack.prototype), {
    getProcessor: () => processor,
    setProcessor: vi.fn(() => Promise.resolve()),
  });
  local.cameraTrack = { videoTrack };
  return videoTrack;
}

describe('MirrorOwnCamera', () => {
  beforeEach(() => {
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
});
