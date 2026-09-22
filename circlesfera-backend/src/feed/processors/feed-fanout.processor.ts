import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  getWorkerOptions,
  QUEUE_NAMES,
} from '../../common/constants/queue-policy.constants.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeedInboxService } from '../feed-inbox.service.js';

interface FanoutJobData {
  postId: string;
  authorId: string;
}

@Processor(QUEUE_NAMES.FEED_FANOUT, getWorkerOptions(QUEUE_NAMES.FEED_FANOUT))
export class FeedFanoutProcessor extends WorkerHost {
  private readonly logger = new Logger(FeedFanoutProcessor.name);
  private readonly BATCH_SIZE = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly feedInbox: FeedInboxService,
  ) {
    super();
  }

  async process(job: Job<FanoutJobData>): Promise<void> {
    if (job.name !== 'distribute') {
      throw new UnrecoverableError(
        `Unknown job name in feed-fanout queue: ${job.name}`,
      );
    }

    const { postId, authorId } = job.data ?? {};
    if (!postId || !authorId) {
      throw new UnrecoverableError(
        'Missing postId or authorId for feed fan-out distribution',
      );
    }

    this.logger.log(`Starting fan-out for post ${postId} by user ${authorId}`);

    try {
      // Verify author profile & user are active and not banned/suspended
      const author = await this.prisma.profile.findUnique({
        where: { id: authorId },
        include: {
          user: {
            select: {
              id: true,
              isActive: true,
              isRootBanned: true,
            },
          },
        },
      });

      if (
        !author ||
        author.isAccountBanned ||
        !author.user?.isActive ||
        author.user?.isRootBanned ||
        (author.suspendedUntil && author.suspendedUntil > new Date())
      ) {
        this.logger.warn(
          `Aborting fan-out for post ${postId}: author ${authorId} is un-operational, banned, or suspended`,
        );
        return;
      }

      let cursor: string | undefined;
      let followersCount = 0;
      let hasMore = true;

      while (hasMore) {
        // Fetch a batch of operational followers using cursor pagination
        const followers = (await this.prisma.follow.findMany({
          where: {
            followingId: authorId,
            status: 'ACCEPTED',
            follower: {
              user: { isActive: true, isRootBanned: false },
              isAccountBanned: false,
            },
          },
          select: { id: true, followerId: true },
          take: this.BATCH_SIZE,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { id: 'asc' }, // Required for cursor pagination predictability
        })) as { id: string; followerId: string }[];

        if (followers.length === 0) {
          hasMore = false;
          break;
        }

        const followerIds = followers.map(
          (f: { id: string; followerId: string }) => f.followerId,
        );

        // Push the post to the inboxes of this batch of followers
        await this.feedInbox.fanoutToFollowers(followerIds, postId);

        followersCount += followers.length;
        cursor = followers[followers.length - 1].id;

        // If we fetched less than the batch size, we've reached the end
        if (followers.length < this.BATCH_SIZE) {
          hasMore = false;
        }
      }

      this.logger.log(
        `Fan-out completed for post ${postId}. Distributed to ${followersCount} followers.`,
      );
    } catch (error) {
      this.logger.error(`Error during fan-out for post ${postId}: ${error}`);
      throw error; // Let BullMQ handle retries
    }
  }
}
