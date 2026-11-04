import { describe, expect, it, vi } from 'vitest';
import { looksAtThePerson, MirrorCamera } from './mirrorCamera';

function camera(facingMode?: string, width = 720, height = 1280) {
  return {
    getSettings: () => ({ facingMode, width, height }),
  } as unknown as MediaStreamTrack;
}

// A page with a canvas that records how each frame was drawn, and a
// schedule that draws only when the test says.
function page({ canSend = true } = {}) {
  const sent = { stop: vi.fn() };
  const context = { setTransform: vi.fn(), drawImage: vi.fn() };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    captureStream: canSend
      ? vi.fn(() => ({ getVideoTracks: () => [sent] }))
      : undefined,
  };
  const doc = { createElement: () => canvas } as unknown as Document;
  const frames: Array<() => void> = [];
  const schedule = (draw: () => void) => frames.push(draw);
  const cancel = vi.fn();
  return { doc, canvas, context, sent, frames, schedule, cancel };
}

const video = (videoWidth = 720, videoHeight = 1280) =>
  ({ videoWidth, videoHeight }) as unknown as HTMLVideoElement;

const opts = (track: MediaStreamTrack, element = video()) =>
  ({ kind: 'video', track, element }) as never;

describe('looksAtThePerson', () => {
  it('is true for the front camera and one that does not say', () => {
    expect(looksAtThePerson(camera('user'))).toBe(true);
    expect(looksAtThePerson(camera(undefined))).toBe(true);
    expect(looksAtThePerson(camera('environment'))).toBe(false);
  });
});

describe('MirrorCamera', () => {
  it('needs a browser that can send a drawing as video', () => {
    expect(MirrorCamera.supported(page().doc)).toBe(true);
    expect(MirrorCamera.supported(page({ canSend: false }).doc)).toBe(false);
  });

  it('sends the front camera turned around, frame after frame', async () => {
    const p = page();
    const mirror = new MirrorCamera(p.doc, p.schedule, p.cancel);
    await mirror.init(opts(camera('user')));

    expect(mirror.processedTrack).toBe(p.sent);
    expect(p.canvas.width).toBe(720);
    expect(p.context.setTransform).toHaveBeenLastCalledWith(
      -1,
      0,
      0,
      1,
      720,
      0,
    );
    expect(p.context.drawImage).toHaveBeenCalledTimes(1);

    p.frames.at(-1)?.();
    expect(p.context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('sends the back camera as it is, and turns again on the front one', async () => {
    const p = page();
    const mirror = new MirrorCamera(p.doc, p.schedule, p.cancel);
    await mirror.init(opts(camera('environment')));
    expect(mirror.isMirrored()).toBe(false);
    expect(p.context.setTransform).toHaveBeenLastCalledWith(1, 0, 0, 1, 0, 0);

    await mirror.restart(opts(camera('user')));
    p.frames.at(-1)?.();
    expect(mirror.isMirrored()).toBe(true);
    // Turning the camera keeps sending the same track.
    expect(mirror.processedTrack).toBe(p.sent);
  });

  it('follows the size of the camera picture', async () => {
    const p = page();
    const mirror = new MirrorCamera(p.doc, p.schedule, p.cancel);
    await mirror.init(opts(camera('user'), video(1080, 1920)));

    expect(p.canvas.width).toBe(1080);
    expect(p.canvas.height).toBe(1920);
  });

  it('draws nothing before the camera has a picture', async () => {
    const p = page();
    const mirror = new MirrorCamera(p.doc, p.schedule, p.cancel);
    await mirror.init(opts(camera('user'), video(0, 0)));

    expect(p.context.drawImage).not.toHaveBeenCalled();
  });

  it('stops drawing and sending when it is taken off', async () => {
    const p = page();
    const mirror = new MirrorCamera(p.doc, p.schedule, p.cancel);
    await mirror.init(opts(camera('user')));
    await mirror.destroy();

    expect(p.cancel).toHaveBeenCalled();
    expect(p.sent.stop).toHaveBeenCalled();
    expect(mirror.processedTrack).toBeUndefined();
  });
});
