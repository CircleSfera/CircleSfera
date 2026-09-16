import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { $Enums, Visibility } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';

const NotificationType = $Enums.NotificationType;

export interface DistributablePostMedia {
  url?: string | null;
  thumbnailUrl?: string | null;
}

export interface DistributablePost {
  id: string;
  profileId: string;
  visibility: Visibility;
  media?: DistributablePostMedia[];
}

export interface DistributionOptions {
  caption?: string | null;
  uniqueMentions?: string[];
}

@Injectable()
export class PostDistributionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('ai-processing') private readonly aiQueue: Queue,
    @InjectQueue('feed-fanout') private readonly feedFanoutQueue: Queue,
  ) {}

  /**
   * Dispatches background workflows after a post is published:
   * 1. AI embedding generation
   * 2. Background content moderation
   * 3. Alt-text generation for accessibility
   * 4. Feed fan-out distribution to followers
   * 5. Mention notification events
   */
  async dispatchPostPublished(
    post: DistributablePost,
    options: DistributionOptions = {},
  ): Promise<void> {
    const caption = options.caption || '';
    const mediaUrls =
      post.media
        ?.map((m) => m.thumbnailUrl || m.url)
        .filter((url): url is string => Boolean(url)) || [];

    // Background AI processing tasks
    await Promise.all([
      this.aiQueue.add('generate-embedding', {
        postId: post.id,
        text: caption,
      }),
      this.aiQueue.add('moderate-content', {
        targetId: post.id,
        text: caption,
        targetType: 'POST',
        mediaUrls,
      }),
      this.aiQueue.add('generate-alt-text', {
        postId: post.id,
      }),
    ]);

    // Feed fan-out distribution for visible posts
    if (
      post.visibility === Visibility.PUBLIC ||
      post.visibility === Visibility.FOLLOWERS
    ) {
      await this.feedFanoutQueue.add('distribute', {
        postId: post.id,
        authorId: post.profileId,
      });
    }

    // Mention notifications
    const mentions = options.uniqueMentions ?? [];
    if (mentions.length > 0) {
      const mentionedProfiles = await this.prisma.profile.findMany({
        where: {
          username: { in: mentions },
          id: { not: post.profileId },
        },
        select: { id: true },
      });

      await Promise.all(
        mentionedProfiles.map((profile) =>
          this.eventEmitter.emit('notification.create', {
            recipientId: profile.id,
            senderId: post.profileId,
            type: NotificationType.MENTION,
            content: 'mentioned you in a post',
          }),
        ),
      );
    }
  }
}
