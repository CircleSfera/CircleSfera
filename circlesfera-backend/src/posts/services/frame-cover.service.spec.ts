import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrameCoverService } from './frame-cover.service.js';

describe('FrameCoverService', () => {
  const prisma = {
    post: { findUnique: vi.fn() },
    postMedia: { update: vi.fn() },
  };
  const queue = { add: vi.fn() };
  let service: FrameCoverService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FrameCoverService(prisma as never, queue as never);
  });

  it('records the moment on the video of the frame and asks for its image', async () => {
    prisma.post.findUnique.mockResolvedValue({
      type: 'FRAME',
      media: [{ id: 'pm-1' }],
    });

    await service.choose('frame-1', 4200);

    expect(prisma.post.findUnique.mock.calls[0][0]).toMatchObject({
      where: { id: 'frame-1' },
      select: { media: { where: { type: 'video' }, take: 1 } },
    });
    expect(prisma.postMedia.update).toHaveBeenCalledWith({
      where: { id: 'pm-1' },
      data: { coverTimeMs: 4200 },
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
    expect(prisma.postMedia.update).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
