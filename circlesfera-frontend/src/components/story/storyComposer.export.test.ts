import { toBlob } from 'html-to-image';
import { toast } from 'react-hot-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import {
  exportStoryCanvas,
  reportStoryExportError,
} from './storyComposer.export';

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }));
vi.mock('react-hot-toast', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

const GRADIENT = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';

function exportWith(bgStyle: string, onPost = vi.fn()) {
  return exportStoryCanvas({
    container: document.createElement('div'),
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

  it('hands the image of the canvas to the owner', async () => {
    const image = new Blob(['png'], { type: 'image/png' });
    vi.mocked(toBlob).mockResolvedValue(image);
    const onPost = vi.fn();

    await exportWith(GRADIENT, onPost);

    expect(onPost).toHaveBeenCalledWith(image);
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
    reportStoryExportError(new Error('SecurityError: tainted canvas'));

    expect(toast.error).toHaveBeenCalledTimes(1);
    const message = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(message).toBe(i18n.t('createPost.storyComposer.export_error'));
    expect(message).not.toContain('tainted');
  });
});
