import { Test, type TestingModule } from '@nestjs/testing';
import { UnrecoverableError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnalyticsService } from '../analytics.service.js';
import { AnalyticsProcessor } from './analytics.processor.js';

describe('AnalyticsProcessor', () => {
  let processor: AnalyticsProcessor;
  let mockPrisma: any;
  let mockAnalyticsService: any;

  beforeEach(async () => {
    mockPrisma = {
      post: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      interactionEvent: {
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      bookmark: {
        count: vi.fn(),
      },
    };

    mockAnalyticsService = {
      handleDailyAggregation: vi.fn(),
      performDailyAggregation: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    }).compile();

    processor = module.get<AnalyticsProcessor>(AnalyticsProcessor);
  });

  it('throws UnrecoverableError for unknown job names', async () => {
    await expect(
      processor.process({ name: 'unknown-job', data: {} } as any),
    ).rejects.toThrow(UnrecoverableError);
  });

  describe('daily-aggregation job', () => {
    it('delegates to analyticsService.handleDailyAggregation', async () => {
      mockAnalyticsService.handleDailyAggregation.mockResolvedValueOnce(
        undefined,
      );
      await processor.process({ name: 'daily-aggregation', data: {} } as any);
      expect(mockAnalyticsService.handleDailyAggregation).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('aggregate-creator job', () => {
    it('throws UnrecoverableError if neither profileId nor userId provided', async () => {
      await expect(
        processor.process({ name: 'aggregate-creator', data: {} } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('delegates to analyticsService.performDailyAggregation with profileId', async () => {
      mockAnalyticsService.performDailyAggregation.mockResolvedValueOnce(
        undefined,
      );
      await processor.process({
        name: 'aggregate-creator',
        data: { profileId: 'prof-1' },
      } as any);
      expect(mockAnalyticsService.performDailyAggregation).toHaveBeenCalledWith(
        'prof-1',
      );
    });

    it('delegates using fallback userId when profileId not present', async () => {
      mockAnalyticsService.performDailyAggregation.mockResolvedValueOnce(
        undefined,
      );
      await processor.process({
        name: 'aggregate-creator',
        data: { userId: 'user-fallback' },
      } as any);
      expect(mockAnalyticsService.performDailyAggregation).toHaveBeenCalledWith(
        'user-fallback',
      );
    });
  });

  describe('update-performance-score job', () => {
    it('throws UnrecoverableError if postId is missing', async () => {
      await expect(
        processor.process({
          name: 'update-performance-score',
          data: {},
        } as any),
      ).rejects.toThrow(UnrecoverableError);
    });

    it('returns early when post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(null);
      mockPrisma.interactionEvent.count.mockResolvedValue(0);
      mockPrisma.interactionEvent.aggregate.mockResolvedValue({
        _sum: { dwellTime: null },
      });
      mockPrisma.bookmark.count.mockResolvedValue(0);

      await processor.process({
        name: 'update-performance-score',
        data: { postId: 'missing-p' },
      } as any);

      expect(mockPrisma.post.update).not.toHaveBeenCalled();
    });

    it('calculates weighted performance score and updates post', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        views: 100,
        _count: { likes: 10, comments: 4 },
      });
      mockPrisma.interactionEvent.count
        .mockResolvedValueOnce(2) // SHARE
        .mockResolvedValueOnce(5); // VIEW_COMPLETE
      mockPrisma.interactionEvent.aggregate.mockResolvedValueOnce({
        _sum: { dwellTime: 30000 }, // 30s
      });
      mockPrisma.bookmark.count.mockResolvedValueOnce(3);

      mockPrisma.post.update.mockResolvedValueOnce({ id: 'post-1' });

      await processor.process({
        name: 'update-performance-score',
        data: { postId: 'post-1' },
      } as any);

      // likes: 10*10 = 100
      // comments: 4*15 = 60
      // bookmarks: 3*12 = 36
      // shares: 2*8 = 16
      // viewCompletes: 5*5 = 25
      // dwellTimeSec: 30 * 0.5 = 15
      // views: 100 * 0.2 = 20
      // total score = 100 + 60 + 36 + 16 + 25 + 15 + 20 = 272
      expect(mockPrisma.post.update).toHaveBeenCalledWith({
        where: { id: 'post-1' },
        data: { performanceScore: 272 },
      });
    });

    it('rethrows error when calculation or update fails', async () => {
      mockPrisma.post.findUnique.mockRejectedValueOnce(new Error('DB failure'));

      await expect(
        processor.process({
          name: 'update-performance-score',
          data: { postId: 'post-err' },
        } as any),
      ).rejects.toThrow('DB failure');
    });
  });
});
