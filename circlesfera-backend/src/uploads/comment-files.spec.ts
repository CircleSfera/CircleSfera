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

    const $queryRaw = vi.fn().mockResolvedValue([]);
    await expect(
      commentFiles({ comment: { findMany }, $queryRaw } as never, {
        postId: 'p-1',
      }),
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

  it('locks each level it reads before reading its replies', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValueOnce([row('c-1'), row('c-2')])
      .mockResolvedValueOnce([]);
    const $queryRaw = vi.fn().mockResolvedValue([]);

    await commentFiles({ comment: { findMany }, $queryRaw } as never, {
      id: 'c-1',
    });

    expect($queryRaw).toHaveBeenCalledTimes(1);
    const [sql, ids] = $queryRaw.mock.calls[0];
    expect(sql.join('?')).toContain('FOR UPDATE');
    expect(ids).toEqual(['c-1', 'c-2']);
    expect($queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[1],
    );
  });

  it('follows replies however deep, and stops on one already seen', async () => {
    let n = 0;
    const deep = vi
      .fn()
      .mockImplementation(async () =>
        n < 30 ? [row(`c-${n++}`, { voiceUrl: `/uploads/${n}.webm` })] : [],
      );
    const files = await commentFiles(
      { comment: { findMany: deep }, $queryRaw: vi.fn() } as never,
      { id: 'c-0' },
    );
    expect(files).toHaveLength(30);

    const loop = vi.fn().mockResolvedValue([row('c-1')]);
    await expect(
      commentFiles(
        { comment: { findMany: loop }, $queryRaw: vi.fn() } as never,
        { id: 'c-1' },
      ),
    ).resolves.toEqual([]);
    expect(loop).toHaveBeenCalledTimes(2);
  });
});
