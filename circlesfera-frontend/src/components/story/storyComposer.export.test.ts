import { toBlob } from 'html-to-image';
import { toast } from 'react-hot-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import {
  exportStoryCanvas,
  hasPaint,
  reportStoryExportError,
} from './storyComposer.export';

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

/** A story canvas of 360 × 640 px. */
function canvas() {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientWidth', { value: 360 });
  Object.defineProperty(node, 'clientHeight', { value: 640 });
  return node;
}

function exportWith(bgStyle: string, onPost = vi.fn()) {
  return exportStoryCanvas({
    container: canvas(),
    backgroundUrl: null,
    bgStyle,
    elementCount: 0,
    onPost,
  });
}

describe('story export', () => {
  beforeEach(() => {
    vi.mocked(toBlob).mockReset();
    vi.mocked(toast.error).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hands the image of the canvas, and its size, to the owner', async () => {
    const image = new Blob(['png'], { type: 'image/png' });
    vi.mocked(toBlob).mockResolvedValue(image);
    const onPost = vi.fn();

    await exportWith(GRADIENT, onPost);

    expect(onPost).toHaveBeenCalledWith(image, { width: 360, height: 640 });
  });

  it('fills the image with black only when the story has no gradient or colour behind it', async () => {
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']));

    await exportWith(GRADIENT);
    await exportWith('#112233');
    await exportWith('');

    const fills = vi
      .mocked(toBlob)
      .mock.calls.map(([, options]) => options?.backgroundColor);
    expect(fills).toEqual([undefined, undefined, '#000000']);
  });

  it('over a video, makes a see-through picture of only what is painted', async () => {
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']));

    await exportStoryCanvas({
      container: canvas(),
      backgroundUrl: 'blob:clip',
      bgStyle: '',
      elementCount: 1,
      layerOnly: true,
      onPost: vi.fn(),
    });

    const [, options] = vi.mocked(toBlob).mock.calls[0];
    expect(options?.backgroundColor).toBeUndefined();
    expect(options?.style).toMatchObject({
      backgroundColor: 'transparent',
      backgroundImage: 'none',
    });
  });

  describe('whether a layer has anything painted', () => {
    function withPixels(alpha: number[]) {
      const data = new Uint8ClampedArray(alpha.length * 4);
      alpha.forEach((a, i) => {
        data[i * 4 + 3] = a;
      });
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ close: vi.fn() })),
      );
      const real = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        const el = real(tag);
        if (tag === 'canvas') {
          (el as HTMLCanvasElement).getContext = vi.fn(() => ({
            drawImage: vi.fn(),
            getImageData: () => ({ data }),
          })) as never;
        }
        return el;
      });
    }

    it('says yes for a single mark, and no for a see-through picture', async () => {
      withPixels([0, 0, 12, 0]);
      expect(await hasPaint(new Blob(['png']))).toBe(true);
      vi.restoreAllMocks();

      withPixels([0, 0, 0, 0]);
      expect(await hasPaint(new Blob(['png']))).toBe(false);
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });
  });

  it('leaves out of the image whatever is marked as editor-only', async () => {
    vi.mocked(toBlob).mockResolvedValue(new Blob(['png']));

    await exportWith(GRADIENT);

    const filter = vi.mocked(toBlob).mock.calls[0][1]?.filter;
    const guide = document.createElement('div');
    guide.dataset.exportIgnore = 'true';
    expect(filter?.(guide)).toBe(false);
    expect(filter?.(document.createElement('div'))).toBe(true);
    expect(
      filter?.(document.createTextNode('x') as unknown as HTMLElement),
    ).toBe(true);
  });

  it('fails, without calling the owner, when no image could be made', async () => {
    vi.mocked(toBlob).mockResolvedValue(null);
    const onPost = vi.fn();

    await expect(exportWith(GRADIENT, onPost)).rejects.toThrow();
    expect(onPost).not.toHaveBeenCalled();
  });

  it('tells the user the story could not be exported, without the technical cause', () => {
    const failure = new Error('SecurityError: tainted canvas');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportStoryExportError(failure);

    // The technical cause goes to the log only.
    expect(log).toHaveBeenCalledWith('Story export failed:', failure);
    expect(toast.error).toHaveBeenCalledTimes(1);
    const message = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(message).toBe(i18n.t('createPost.storyComposer.export_error'));
    expect(message).not.toContain('tainted');
  });
});
