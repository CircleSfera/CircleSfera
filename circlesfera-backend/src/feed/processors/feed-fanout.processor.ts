import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FeedInboxService } from '../feed-inbox.service.js';

interface FanoutJobData {
  postId: string;
  authorId: string;
}

@Processor('feed-fanout')
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
    const { postId, authorId } = job.data;
    this.logger.log(`Starting fan-out for post ${postId} by user ${authorId}`);

    try {
      let skip = 0;
      let followersCount = 0;
      let hasMore = true;

      while (hasMore) {
        // Fetch a batch of followers
        const followers = await this.prisma.follow.findMany({
          where: { followingId: authorId, status: 'ACCEPTED' },
          select: { followerId: true },
          skip,
          take: this.BATCH_SIZE,
        });

        if (followers.length === 0) {
          hasMore = false;
          break;
        }

        const followerIds = followers.map((f) => f.followerId);

        // Push the post to the inboxes of this batch of followers
        await this.feedInbox.fanoutToFollowers(followerIds, postId);

        followersCount += followers.length;
        skip += this.BATCH_SIZE;

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
