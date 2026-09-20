import type { Job } from 'bullmq';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { FeedInboxService } from '../feed-inbox.service.js';
import { FeedFanoutProcessor } from './feed-fanout.processor.js';

describe('FeedFanoutProcessor', () => {
  let processor: FeedFanoutProcessor;
  let mockPrisma: {
    follow: {
      findMany: ReturnType<typeof vi.fn>;
    };
    profile: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };
  let mockFeedInbox: {
    fanoutToFollowers: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = {
      follow: {
        findMany: vi.fn(),
      },
      profile: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'a1',
          isAccountBanned: false,
          user: { id: 'u1', isActive: true, isRootBanned: false },
        }),
      },
    };
    mockFeedInbox = {
      fanoutToFollowers: vi.fn().mockResolvedValue(undefined),
    };

    processor = new FeedFanoutProcessor(
      mockPrisma as unknown as PrismaService,
      mockFeedInbox as unknown as FeedInboxService,
    );
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('throws UnrecoverableError if job name is not distribute', async () => {
    const job = {
      name: 'other-job',
      data: { postId: 'p1', authorId: 'a1' },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow(UnrecoverableError);
  });

  it('throws UnrecoverableError if postId or authorId is missing', async () => {
    const jobNoData = {
      name: 'distribute',
      data: null,
    } as unknown as Job;
    await expect(processor.process(jobNoData)).rejects.toThrow(
      UnrecoverableError,
    );

    const jobMissingAuthor = {
      name: 'distribute',
      data: { postId: 'p1' },
    } as unknown as Job;
    await expect(processor.process(jobMissingAuthor)).rejects.toThrow(
      UnrecoverableError,
    );
  });

  it('handles author with zero followers gracefully', async () => {
    mockPrisma.follow.findMany.mockResolvedValueOnce([]);

    const job = {
      name: 'distribute',
      data: { postId: 'p1', authorId: 'a1' },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrisma.follow.findMany).toHaveBeenCalled();
    expect(mockFeedInbox.fanoutToFollowers).not.toHaveBeenCalled();
  });

  it('aborts fanout when author is banned or inactive', async () => {
    mockPrisma.profile.findUnique.mockResolvedValueOnce({
      id: 'a1',
      isAccountBanned: true,
      user: { id: 'u1', isActive: false, isRootBanned: true },
    });

    const job = {
      name: 'distribute',
      data: { postId: 'p1', authorId: 'a1' },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrisma.follow.findMany).not.toHaveBeenCalled();
    expect(mockFeedInbox.fanoutToFollowers).not.toHaveBeenCalled();
  });

  it('paginates through multiple batches of followers using cursor', async () => {
    // Batch 1 has 1000 items
    const batch1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `follow-${i}`,
      followerId: `user-${i}`,
    }));
    // Batch 2 has 2 items (< 1000, terminates loop)
    const batch2 = [
      { id: 'follow-1000', followerId: 'user-1000' },
      { id: 'follow-1001', followerId: 'user-1001' },
    ];

    mockPrisma.follow.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2);

    const job = {
      name: 'distribute',
      data: { postId: 'post-multi', authorId: 'author-star' },
    } as unknown as Job;

    await processor.process(job);

    expect(mockPrisma.follow.findMany).toHaveBeenCalledTimes(2);
    expect(mockFeedInbox.fanoutToFollowers).toHaveBeenCalledTimes(2);
    expect(mockFeedInbox.fanoutToFollowers).toHaveBeenNthCalledWith(
      1,
      batch1.map((f) => f.followerId),
      'post-multi',
    );
    expect(mockFeedInbox.fanoutToFollowers).toHaveBeenNthCalledWith(
      2,
      batch2.map((f) => f.followerId),
      'post-multi',
    );
  });

  it('catches and rethrows errors during fanout processing', async () => {
    mockPrisma.follow.findMany.mockRejectedValueOnce(new Error('DB failure'));

    const job = {
      name: 'distribute',
      data: { postId: 'p1', authorId: 'a1' },
    } as unknown as Job;

    await expect(processor.process(job)).rejects.toThrow('DB failure');
  });
});
