import { ErrorCode } from '@circlesfera/shared';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAME_COVER_IMAGE_EXTENSIONS } from '../../common/constants/post-media.constants.js';
import { AppException } from '../../common/errors/app.exception.js';
import { FrameCoverService } from './frame-cover.service.js';

describe('FrameCoverService', () => {
  const prisma = {
    post: { findUnique: vi.fn() },
    postMedia: { update: vi.fn() },
    media: { updateMany: vi.fn() },
  };
  const queue = { add: vi.fn() };
  const uploads = { ownsUrl: vi.fn() };
  const storedFiles = { assertOwnedBy: vi.fn() };
  let service: FrameCoverService;

  const frame = (mediaId: string | null = 'media-1') => ({
    type: 'FRAME',
    profileId: 'author-1',
    media: [{ id: 'pm-1', mediaId }],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    uploads.ownsUrl.mockReturnValue(true);
    storedFiles.assertOwnedBy.mockResolvedValue(undefined);
    service = new FrameCoverService(
      prisma as never,
      queue as never,
      uploads as never,
      storedFiles as never,
    );
  });

  it('records the moment on the video of the frame, drops a chosen image and asks for its image', async () => {
    prisma.post.findUnique.mockResolvedValue(frame());

    await service.choose('frame-1', 4200);

    expect(prisma.post.findUnique.mock.calls[0][0]).toMatchObject({
      where: { id: 'frame-1' },
      select: { media: { where: { type: 'video' }, take: 1 } },
    });
    expect(prisma.postMedia.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { coverTimeMs: 4200, coverImageUrl: null },
    });
    expect(queue.add).toHaveBeenCalledWith('cover', { postMediaId: 'pm-1' });
  });

  it.each([
    ['a post that is not a frame', { type: 'POST', media: [{ id: 'pm-1' }] }],
    ['a frame with no video', { type: 'FRAME', media: [] }],
    ['a post that does not exist', null],
  ])('refuses %s and changes nothing', async (_what, post) => {
    prisma.post.findUnique.mockResolvedValue(post);

    await expect(service.choose('p-1', 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.chooseImage('p-1', '/uploads/cover.webp'),
    ).rejects.toThrow('Only a frame has a cover to choose');
    expect(prisma.postMedia.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(storedFiles.assertOwnedBy).not.toHaveBeenCalled();
  });

  describe('an image as the cover', () => {
    it('is put in place at once and drops a chosen moment', async () => {
      prisma.post.findUnique.mockResolvedValue(frame());

      await service.chooseImage('frame-1', '/uploads/cover.webp');

      expect(storedFiles.assertOwnedBy).toHaveBeenCalledWith('author-1', [
        '/uploads/cover.webp',
      ]);
      expect(prisma.postMedia.update).toHaveBeenCalledWith({
        where: { id: 'pm-1' },
        data: {
          coverImageUrl: '/uploads/cover.webp',
          thumbnailUrl: '/uploads/cover.webp',
          coverTimeMs: null,
        },
      });
      expect(prisma.media.updateMany).toHaveBeenCalledWith({
        where: { id: 'media-1' },
        data: { thumbnailUrl: '/uploads/cover.webp' },
      });
      // Nothing is made in the background for an image.
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('writes no shared record for a frame whose media has none', async () => {
      prisma.post.findUnique.mockResolvedValue(frame(null));

      await service.chooseImage('frame-1', '/uploads/cover.jpg');

      expect(prisma.postMedia.update).toHaveBeenCalled();
      expect(prisma.media.updateMany).not.toHaveBeenCalled();
    });

    it.each(FRAME_COVER_IMAGE_EXTENSIONS)(
      'takes a picture ending in .%s',
      async (extension) => {
        await expect(
          service.assertImage('author-1', `/uploads/cover.${extension}`),
        ).resolves.toBeUndefined();
        await expect(
          service.assertImage(
            'author-1',
            `/uploads/cover.${extension.toUpperCase()}`,
          ),
        ).resolves.toBeUndefined();
      },
    );

    it.each([
      ['a video', '/uploads/clip.mp4'],
      ['a file with no kind', '/uploads/cover'],
      ['a moving picture', '/uploads/cover.gif'],
    ])('refuses %s with its code', async (_what, url) => {
      const refusal = await service
        .assertImage('author-1', url)
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(AppException);
      expect((refusal as AppException).errorCode).toBe(
        ErrorCode.FRAME_COVER_IMAGE_INVALID,
      );
      expect((refusal as AppException).getStatus()).toBe(400);
      expect(storedFiles.assertOwnedBy).not.toHaveBeenCalled();
    });

    it('refuses a file that is not of this storage with its code', async () => {
      uploads.ownsUrl.mockReturnValue(false);
      prisma.post.findUnique.mockResolvedValue(frame());

      const refusal = await service
        .chooseImage('frame-1', 'https://elsewhere.example/cover.jpg')
        .catch((error: unknown) => error);

      expect(uploads.ownsUrl).toHaveBeenCalledWith(
        'https://elsewhere.example/cover.jpg',
      );
      expect((refusal as AppException).errorCode).toBe(
        ErrorCode.FRAME_COVER_IMAGE_INVALID,
      );
      expect(storedFiles.assertOwnedBy).not.toHaveBeenCalled();
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
    });

    it('refuses a file the author did not upload and changes nothing', async () => {
      prisma.post.findUnique.mockResolvedValue(frame());
      storedFiles.assertOwnedBy.mockRejectedValue(
        AppException.BadRequest(ErrorCode.FILE_NOT_OWNED),
      );

      const refusal = await service
        .chooseImage('frame-1', '/uploads/someone-else.jpg')
        .catch((error: unknown) => error);

      expect((refusal as AppException).errorCode).toBe(
        ErrorCode.FILE_NOT_OWNED,
      );
      expect(prisma.postMedia.update).not.toHaveBeenCalled();
      expect(prisma.media.updateMany).not.toHaveBeenCalled();
    });
  });
});
