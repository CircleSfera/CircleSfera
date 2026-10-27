import { describe, expect, it, vi } from 'vitest';
import { commentFiles } from './comment-files.js';

const row = (id: string, files: Record<string, unknown> = {}) => ({
  id,
  url: null,
  standardUrl: null,
  thumbnailUrl: null,
  voiceUrl: null,
  media: null,
  voiceMedia: null,
  ...files,
});

describe('commentFiles', () => {
  it('collects every file of the comments and of their replies, once each', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([
        row('c-1', {
          url: '/uploads/a.jpg',
          standardUrl: '/uploads/a_std.webp',
          thumbnailUrl: '/uploads/a_thumb.webp',
          media: {
            url: '/uploads/a.jpg',
            standardUrl: '/uploads/a_std.webp',
            thumbnailUrl: null,
          },
        }),
      ])
      .mockResolvedValueOnce([
        row('c-2', {
          voiceUrl: '/uploads/v.webm',
          voiceMedia: {
            url: '/uploads/v.m4a',
            standardUrl: null,
            thumbnailUrl: '/uploads/v.png',
          },
        }),
      ])
      .mockResolvedValueOnce([row('c-3')])
      .mockResolvedValueOnce([]);

    await expect(
      commentFiles({ comment: { findMany } } as never, { postId: 'p-1' }),
    ).resolves.toEqual([
      '/uploads/a.jpg',
      '/uploads/a_std.webp',
      '/uploads/a_thumb.webp',
      '/uploads/v.webm',
      '/uploads/v.m4a',
      '/uploads/v.png',
    ]);
    expect(findMany.mock.calls.map((call) => call[0].where)).toEqual([
      { postId: 'p-1' },
      { parentId: { in: ['c-1'] } },
      { parentId: { in: ['c-2'] } },
      { parentId: { in: ['c-3'] } },
    ]);
  });

  it('stops on a reply already seen, and after twenty levels', async () => {
    const loop = vi.fn().mockResolvedValue([row('c-1')]);
    await expect(
      commentFiles({ comment: { findMany: loop } } as never, { id: 'c-1' }),
    ).resolves.toEqual([]);
    expect(loop).toHaveBeenCalledTimes(2);

    let n = 0;
    const deep = vi.fn().mockImplementation(async () => [row(`c-${n++}`)]);
    await commentFiles({ comment: { findMany: deep } } as never, { id: 'c-0' });
    expect(deep).toHaveBeenCalledTimes(20);
  });
});
