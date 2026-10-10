import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '../constants/uploadLimits';
import i18n from '../i18n';
import { api } from '../services';
import { useMediaUpload } from './useMediaUpload';

vi.mock('../services', () => ({ api: { post: vi.fn() } }));
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn() } }));

const file = (name: string, size = 10) => {
  const made = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(made, 'size', { value: size });
  return made;
};
const refused = (extra: object) =>
  Object.assign(new Error('server text, never shown'), extra);

describe('useMediaUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const upload = async (
    items: Parameters<ReturnType<typeof useMediaUpload>['uploadFiles']>[0],
    alt: Record<number, string> = {},
  ) => {
    const { result } = renderHook(() => useMediaUpload());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current
        .uploadFiles(items, alt)
        .catch((error: Error) => error);
    });
    return { outcome, isUploading: result.current.isUploading };
  };

  it('uploads each file and keeps its filter and its alt text', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: {
        url: 'https://cdn/a.jpg',
        thumbnailUrl: 'https://cdn/a-t.jpg',
        type: 'image',
      },
    } as never);

    const { outcome, isUploading } = await upload(
      [{ file: file('a.jpg'), filter: 'grayscale', type: 'image' }],
      { 0: 'A red door' },
    );

    expect(outcome).toEqual([
      {
        url: 'https://cdn/a.jpg',
        thumbnailUrl: 'https://cdn/a-t.jpg',
        type: 'image',
        filter: 'grayscale',
        altText: 'A red door',
      },
    ]);
    const [path, body, options] = vi.mocked(api.post).mock.calls[0];
    expect(path).toBe('/uploads');
    expect((body as FormData).get('file')).toBeInstanceOf(File);
    expect(options).toEqual({
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    expect(isUploading).toBe(false);
  });

  it('does not upload again a file that is already stored, and gives it an empty alt text when none was written', async () => {
    const { outcome } = await upload([
      { file: file('a.jpg'), type: 'image', remoteUrl: 'https://cdn/kept.jpg' },
    ]);

    expect(outcome).toEqual([
      {
        url: 'https://cdn/kept.jpg',
        type: 'image',
        filter: undefined,
        altText: '',
      },
    ]);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('refuses a file over the limit before sending it, naming the file and the limit', async () => {
    const { outcome } = await upload([
      { file: file('big.mp4', MAX_UPLOAD_BYTES + 1), type: 'video' },
    ]);

    expect((outcome as Error).message).toBe(
      i18n.t('createPost.upload.file_too_large', {
        name: 'big.mp4',
        maxMb: MAX_UPLOAD_MB,
      }),
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('says the file is too large when the server answers 413', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(refused({ status: 413 }));

    const { outcome } = await upload([{ file: file('a.jpg'), type: 'image' }]);

    expect((outcome as Error).message).toBe(
      i18n.t('createPost.upload.file_too_large', {
        name: 'a.jpg',
        maxMb: MAX_UPLOAD_MB,
      }),
    );
  });

  it.each([
    ['being offline', { isNetworkError: true }, 'errors.generic.network'],
    ['too many uploads', { status: 429 }, 'errors.generic.rate_limited'],
    ['a server error', { status: 503 }, 'errors.generic.server'],
  ])(
    'says so for %s, in the language of the reader',
    async (_case, extra, key) => {
      vi.mocked(api.post).mockRejectedValueOnce(refused(extra));

      const { outcome, isUploading } = await upload([
        { file: file('a.jpg'), type: 'image' },
      ]);

      expect((outcome as Error).message).toBe(i18n.t(key));
      expect(isUploading).toBe(false);
    },
  );

  it('names the file for any other failure, and never shows the text of the server', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(refused({ status: 400 }));

    const { outcome } = await upload([{ file: file('a.jpg'), type: 'image' }]);

    expect((outcome as Error).message).toBe(
      i18n.t('createPost.upload.upload_failed', { name: 'a.jpg' }),
    );
    expect((outcome as Error).message).not.toContain('server text');
  });

  it('fails the whole upload when one file fails', async () => {
    vi.mocked(api.post)
      .mockResolvedValueOnce({
        data: { url: 'https://cdn/a.jpg', type: 'image' },
      } as never)
      .mockRejectedValueOnce(refused({ status: 400 }));

    const { outcome } = await upload([
      { file: file('a.jpg'), type: 'image' },
      { file: file('b.jpg'), type: 'image' },
    ]);

    expect(outcome).toBeInstanceOf(Error);
    expect((outcome as Error).message).toContain('b.jpg');
  });
});
