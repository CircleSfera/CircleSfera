import { ErrorCode } from '@circlesfera/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { FRAME_COVER_IMAGE_EXTENSIONS } from '../../common/constants/post-media.constants.js';
import { QUEUE_NAMES } from '../../common/constants/queue-policy.constants.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StoredFilesService } from '../../uploads/services/stored-files.service.js';
import { UploadsService } from '../../uploads/uploads.service.js';

const IMAGE_ADDRESS = new RegExp(
  `\\.(${FRAME_COVER_IMAGE_EXTENSIONS.join('|')})$`,
  'i',
);

/**
 * The cover of a frame, chosen by its author: a moment of the frame's own
 * video, whose image is made in the background (until it is ready the frame
 * keeps the cover it had), or an image the author uploaded. Choosing one
 * clears the other. A cover image left behind stays its author's file.
 */
@Injectable()
export class FrameCoverService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.VIDEO_TRANSCODING)
    private readonly videoQueue: Queue,
    @Inject(UploadsService) private readonly uploads: UploadsService,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
  ) {}

  // The video a cover can be taken from: only a frame has one to choose.
  private async videoOf(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        type: true,
        profileId: true,
        media: {
          where: { type: 'video' },
          orderBy: { order: 'asc' },
          take: 1,
          select: { id: true, mediaId: true },
        },
      },
    });
    const video = post?.type === 'FRAME' ? post.media[0] : undefined;
    if (!post || !video) {
      throw new BadRequestException('Only a frame has a cover to choose');
    }
    return { ...video, profileId: post.profileId };
  }

  /** Records the chosen moment and asks for its image to be made. */
  async choose(postId: string, coverTimeMs: number): Promise<void> {
    const video = await this.videoOf(postId);
    await this.prisma.postMedia.update({
      where: { id: video.id },
      data: { coverTimeMs, coverImageUrl: null },
    });
    await this.videoQueue.add('cover', { postMediaId: video.id });
  }

  /**
   * Refuses an image that cannot be a frame's cover: a file of another
   * storage, a file that is not a picture, or one the Profile did not upload.
   */
  async assertImage(profileId: string, url: string): Promise<void> {
    if (!this.uploads.ownsUrl(url) || !IMAGE_ADDRESS.test(url)) {
      throw AppException.BadRequest(ErrorCode.FRAME_COVER_IMAGE_INVALID);
    }
    await this.storedFiles.assertOwnedBy(profileId, [url]);
  }

  /** Records an image the author uploaded as the cover, in place at once. */
  async chooseImage(postId: string, url: string): Promise<void> {
    const video = await this.videoOf(postId);
    await this.assertImage(video.profileId, url);
    // A moment chosen before is dropped: its image, if still being made, is
    // not written over this one.
    await this.prisma.postMedia.update({
      where: { id: video.id },
      data: { coverImageUrl: url, thumbnailUrl: url, coverTimeMs: null },
    });
    if (video.mediaId) {
      await this.prisma.media.updateMany({
        where: { id: video.mediaId },
        data: { thumbnailUrl: url },
      });
    }
  }
}
