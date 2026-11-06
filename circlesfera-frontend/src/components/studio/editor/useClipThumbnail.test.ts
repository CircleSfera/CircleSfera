import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaClip, textClip } from '../../../test/studio-fixtures';
import { useClipThumbnail } from './useClipThumbnail';

type Probe = Record<string, any>;

/** Every video the hook makes, to play its part by hand. */
function fakeVideos(outcome: 'frame' | 'error' | 'no-canvas') {
  const made: Probe[] = [];
  const create = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'canvas') {
      if (outcome === 'no-canvas') {
        return {
          getContext: () => {
            throw new Error('tainted');
          },
        };
      }
      return {
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: () => 'data:image/jpeg;frame',
      };
    }
    if (tag !== 'video') return create(tag);
    const video: Probe = {
      duration: 8,
      videoWidth: 1080,
      videoHeight: 1920,
      removeAttribute: vi.fn(),
      load: vi.fn(),
      set src(_v: string) {
        queueMicrotask(() => {
          if (outcome === 'error') return video.onerror?.();
          video.onloadeddata?.();
          video.onseeked?.();
        });
      },
    };
    made.push(video);
    return video;
  }) as never);
  return made;
}

describe('the picture of a clip on the timeline', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is the photo itself for a photo, and none for a text or a sound', () => {
    const photo = renderHook(() =>
      useClipThumbnail(
        mediaClip('p', { type: 'image', fileUrl: 'https://cdn/p.jpg' }),
      ),
    );
    expect(photo.result.current).toBe('https://cdn/p.jpg');
    expect(
      renderHook(() => useClipThumbnail(textClip('t'))).result.current,
    ).toBeNull();
    expect(
      renderHook(() => useClipThumbnail(mediaClip('s', { type: 'audio' })))
        .result.current,
    ).toBeNull();
  });

  it('is a frame of a video from where the clip starts, made once and kept', async () => {
    const made = fakeVideos('frame');
    const clip = mediaClip('v', {
      fileUrl: 'https://cdn/once.mp4',
      mediaStart: 3,
    });
    const first = renderHook(() => useClipThumbnail(clip));
    await waitFor(() =>
      expect(first.result.current).toBe('data:image/jpeg;frame'),
    );
    expect(made[0].currentTime).toBe(3);

    const again = renderHook(() => useClipThumbnail(clip));
    expect(again.result.current).toBe('data:image/jpeg;frame');
    expect(made).toHaveLength(1);
  });

  it('is none when the video cannot be read or drawn', async () => {
    fakeVideos('error');
    const broken = renderHook(() =>
      useClipThumbnail(mediaClip('x', { fileUrl: 'https://cdn/broken.mp4' })),
    );
    await act(async () => {});
    expect(broken.result.current).toBeNull();

    vi.restoreAllMocks();
    fakeVideos('no-canvas');
    const tainted = renderHook(() =>
      useClipThumbnail(mediaClip('y', { fileUrl: 'https://cdn/tainted.mp4' })),
    );
    await act(async () => {});
    expect(tainted.result.current).toBeNull();
  });

  it('is not set on a clip that is gone before its frame is ready', async () => {
    fakeVideos('frame');
    const view = renderHook(() =>
      useClipThumbnail(mediaClip('z', { fileUrl: 'https://cdn/gone.mp4' })),
    );
    view.unmount();
    await act(async () => {});
    expect(view.result.current).toBeNull();
  });
});
