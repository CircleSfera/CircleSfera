import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaProcessing } from './useMediaProcessing';

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

// It keeps no state: rendered once, its two functions serve every test.
const { normalizeImage, processFiles } = renderHook(() => useMediaProcessing())
  .result.current;
const image = (name = 'photo.heic', type = 'image/heic') =>
  new File(['x'], name, { type });

// What the browser would do with the picture, and where it can fail.
function browser({
  width = 800,
  height = 600,
  read = true,
  decode = true,
  context = true,
  blob = true,
} = {}) {
  const drawImage = vi.fn();
  const sizes: { width: number; height: number }[] = [];
  vi.stubGlobal(
    'FileReader',
    class {
      onload: ((e: unknown) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() =>
          read
            ? this.onload?.({ target: { result: 'data:image/heic;base64,x' } })
            : this.onerror?.(),
        );
      }
    },
  );
  vi.stubGlobal(
    'Image',
    class {
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => (decode ? this.onload?.() : this.onerror?.()));
      }
    },
  );
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag !== 'canvas') return create(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => (context ? { drawImage } : null),
      toBlob: (
        done: (b: Blob | null) => void,
        type: string,
        quality: number,
      ) => {
        sizes.push({ width: canvas.width, height: canvas.height });
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.95);
        done(blob ? new Blob(['jpeg'], { type }) : null);
      },
    };
    return canvas as never;
  });
  return { drawImage, sizes };
}

describe('useMediaProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('turns any picture into a JPEG with the same name', async () => {
    const { sizes, drawImage } = browser();

    const out = await normalizeImage(image('holiday.photo.heic'));

    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('holiday.photo.jpg');
    expect(sizes).toEqual([{ width: 800, height: 600 }]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
  });

  it.each([
    ['wide', 4000, 1000, 2000, 500],
    ['tall', 1000, 4000, 500, 2000],
    ['just at the limit', 2000, 2000, 2000, 2000],
  ])(
    'scales a %s picture down to 2000 px on its longer side, keeping its shape',
    async (_case, width, height, outWidth, outHeight) => {
      const { sizes } = browser({ width, height });

      await normalizeImage(image());

      expect(sizes).toEqual([{ width: outWidth, height: outHeight }]);
    },
  );

  it('leaves a video as it is', async () => {
    const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const reader = vi.fn();
    vi.stubGlobal('FileReader', reader);

    expect(await normalizeImage(video)).toBe(video);
    expect(reader).not.toHaveBeenCalled();
  });

  it.each([
    ['it cannot be read', { read: false }],
    ['it cannot be decoded', { decode: false }],
    ['the browser gives no canvas', { context: false }],
    ['the browser gives no JPEG', { blob: false }],
  ])('gives the original file back when %s', async (_case, failure) => {
    browser(failure);
    const original = image();

    expect(await normalizeImage(original)).toBe(original);
  });

  it('normalizes the pictures of a selection and leaves the rest untouched, in the same order', async () => {
    browser();
    const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' });
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });

    const out = await processFiles([image('a.png', 'image/png'), video, text]);

    expect(out.map((file) => file.name)).toEqual([
      'a.jpg',
      'clip.mp4',
      'notes.txt',
    ]);
    expect(out[1]).toBe(video);
    expect(out[2]).toBe(text);
  });
});
