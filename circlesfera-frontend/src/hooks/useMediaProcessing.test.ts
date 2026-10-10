import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger';
import { useMediaProcessing } from './useMediaProcessing';

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

// What the device does with a picture, stood in for: reading the file,
// decoding it and drawing it on a canvas.
const device = {
  readFails: false,
  decodeFails: false,
  size: { width: 800, height: 600 },
  context: true,
  blob: true,
  drawn: [] as number[][],
  canvas: { width: 0, height: 0 },
  quality: [] as unknown[],
};
class FakeReader {
  onload?: (e: { target: { result: string } }) => void;
  onerror?: () => void;
  readAsDataURL() {
    Promise.resolve().then(() =>
      device.readFails
        ? this.onerror?.()
        : this.onload?.({ target: { result: 'data:image/png;base64,AAAA' } }),
    );
  }
}
class FakeImage {
  onload?: () => void;
  onerror?: () => void;
  width = device.size.width;
  height = device.size.height;
  set src(_value: string) {
    Promise.resolve().then(() =>
      device.decodeFails ? this.onerror?.() : this.onload?.(),
    );
  }
}
const file = (name: string, type: string) => new File(['x'], name, { type });

describe('useMediaProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(device, {
      readFails: false,
      decodeFails: false,
      size: { width: 800, height: 600 },
      context: true,
      blob: true,
      drawn: [],
      quality: [],
    });
    vi.stubGlobal('FileReader', FakeReader);
    vi.stubGlobal('Image', FakeImage);
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return realCreate(tag);
      device.canvas = { width: 0, height: 0 };
      return Object.assign(device.canvas, {
        getContext: () =>
          device.context
            ? {
                drawImage: (...args: unknown[]) =>
                  device.drawn.push(args.slice(1) as number[]),
              }
            : null,
        toBlob: (
          done: (blob: Blob | null) => void,
          type: string,
          quality: number,
        ) => {
          device.quality = [type, quality];
          done(device.blob ? new Blob(['jpeg'], { type }) : null);
        },
      });
    }) as never);
    vi.useFakeTimers({
      toFake: ['Date'],
      now: new Date('2026-05-01T12:00:00Z'),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('turns a picture of any format into a JPEG with the same name', async () => {
    const { normalizeImage } = useMediaProcessing();

    const result = await normalizeImage(
      file('holiday.photo.heic', 'image/heic'),
    );

    expect(result.name).toBe('holiday.photo.jpg');
    expect(result.type).toBe('image/jpeg');
    expect(result.lastModified).toBe(Date.parse('2026-05-01T12:00:00Z'));
    expect(device.quality).toEqual(['image/jpeg', 0.95]);
    // Small enough: drawn at its own size.
    expect(device.canvas).toMatchObject({ width: 800, height: 600 });
    expect(device.drawn).toEqual([[0, 0, 800, 600]]);
  });

  it('scales a very large picture down to 2000 on its longer side, keeping its shape', async () => {
    device.size = { width: 4000, height: 3000 };
    const { normalizeImage } = useMediaProcessing();

    await normalizeImage(file('big.png', 'image/png'));

    expect(device.canvas).toMatchObject({ width: 2000, height: 1500 });
  });

  it('scales a very tall picture by its height', async () => {
    device.size = { width: 1000, height: 5000 };
    const { normalizeImage } = useMediaProcessing();

    await normalizeImage(file('tall.png', 'image/png'));

    expect(device.canvas).toMatchObject({ width: 400, height: 2000 });
  });

  it('leaves a video as it is, without reading it', async () => {
    const reading = vi.spyOn(FakeReader.prototype, 'readAsDataURL');
    const clip = file('clip.mp4', 'video/mp4');
    const { normalizeImage } = useMediaProcessing();

    expect(await normalizeImage(clip)).toBe(clip);
    expect(reading).not.toHaveBeenCalled();
  });

  it.each([
    ['the file cannot be read', { readFails: true }],
    ['the picture cannot be decoded', { decodeFails: true }],
    ['the device gives no canvas to draw on', { context: false }],
    ['the canvas gives no picture back', { blob: false }],
  ])('keeps the original when %s', async (_name, failure) => {
    Object.assign(device, failure);
    const original = file('one.png', 'image/png');
    const { normalizeImage } = useMediaProcessing();

    expect(await normalizeImage(original)).toBe(original);
  });

  it('processes the pictures of a selection and leaves everything else alone, in order', async () => {
    const clip = file('clip.mp4', 'video/mp4');
    const note = file('note.txt', 'text/plain');
    const { processFiles } = useMediaProcessing();

    const result = await processFiles([
      file('a.png', 'image/png'),
      clip,
      note,
      file('b.webp', 'image/webp'),
    ]);

    expect(result.map((f) => f.name)).toEqual([
      'a.jpg',
      'clip.mp4',
      'note.txt',
      'b.jpg',
    ]);
    expect(result[1]).toBe(clip);
    expect(result[2]).toBe(note);
  });

  it('keeps the original of a picture whose processing breaks, and records it', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        readAsDataURL() {
          throw new Error('no reader');
        }
      },
    );
    const original = file('one.png', 'image/png');
    const { processFiles } = useMediaProcessing();

    expect(await processFiles([original])).toEqual([original]);
    expect(logger.error).toHaveBeenCalledWith(
      'Normalization failed for:',
      'one.png',
      expect.any(Error),
    );
  });
});
