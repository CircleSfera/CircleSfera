import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../common/constants/queue-policy.constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * The cover of a frame, chosen by its author as a moment of the frame's own
 * video. The image is made in the background; until it is ready the frame
 * keeps the cover it had.
 */
@Injectable()
export class FrameCoverService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.VIDEO_TRANSCODING)
    private readonly videoQueue: Queue,
  ) {}

  // The video a cover can be taken from: only a frame has one to choose.
  private async videoOf(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        type: true,
        media: {
          where: { type: 'video' },
          orderBy: { order: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    const video = post?.type === 'FRAME' ? post.media[0] : undefined;
    if (!video) {
      throw new BadRequestException('Only a frame has a cover to choose');
    }
    return video;
  }

  /** Records the chosen moment and asks for its image to be made. */
  async choose(postId: string, coverTimeMs: number): Promise<void> {
    const video = await this.videoOf(postId);
    await this.prisma.postMedia.update({
      where: { id: video.id },
      data: { coverTimeMs },
    });
    await this.videoQueue.add('cover', { postMediaId: video.id });
  }
}
