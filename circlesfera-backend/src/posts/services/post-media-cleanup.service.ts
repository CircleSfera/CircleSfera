import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface PostMediaItemLike {
  url?: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
}

@Injectable()
export class PostMediaCleanupService {
  constructor(
    @InjectQueue('posts-processing') private readonly postsQueue: Queue,
  ) {}

  /**
   * Enqueues background cleanup for the media files associated with a post.
   */
  async cleanupMedia(
    authorProfileId: string,
    media?: PostMediaItemLike[] | null,
  ): Promise<void> {
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
      // Only the author's own files are deleted, by the job (TD-008).
      await this.postsQueue.add('delete-post-media', {
        authorProfileId,
        mediaUrls: Array.from(mediaUrls),
      });
    }
  }
}
