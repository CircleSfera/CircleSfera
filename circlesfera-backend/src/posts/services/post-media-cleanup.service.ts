import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface PostMediaItemLike {
  url?: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
}

@Injectable()
export class PostMediaCleanupService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('posts-processing') private readonly postsQueue: Queue,
  ) {}

  /**
   * Enqueues background cleanup for the media files associated with a post.
   */
  async cleanupMedia(media?: PostMediaItemLike[] | null): Promise<void> {
    if (!media || media.length === 0) {
      return;
    }

    const mediaUrls = new Set<string>();
    for (const m of media) {
      if (m.url) mediaUrls.add(m.url);
      if (m.standardUrl) mediaUrls.add(m.standardUrl);
      if (m.thumbnailUrl) mediaUrls.add(m.thumbnailUrl);
    }

    if (mediaUrls.size > 0) {
      await this.postsQueue.add('delete-post-media', {
        mediaUrls: Array.from(mediaUrls),
      });
    }
  }

  /**
   * Listens for user hard deletion and emits batch cleanup event for all media of the deleted user's posts.
   */
  @OnEvent('user.hard_deleted')
  async handleUserDeleted(payload: { profileId: string }): Promise<void> {
    const userPosts = await this.prisma.post.findMany({
      where: { profileId: payload.profileId },
      include: { media: true },
    });

    const mediaUrls = new Set<string>();
    for (const post of userPosts) {
      for (const m of post.media) {
        if (m.url) mediaUrls.add(m.url);
        if (m.standardUrl) mediaUrls.add(m.standardUrl);
        if (m.thumbnailUrl) mediaUrls.add(m.thumbnailUrl);
      }
    }

    if (mediaUrls.size > 0) {
      this.eventEmitter.emit('media.delete_batch', {
        mediaUrls: Array.from(mediaUrls),
      });
    }
  }
}
