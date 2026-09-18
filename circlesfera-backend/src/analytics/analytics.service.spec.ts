import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import { UserEventType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  let mockQueue: any;

  const mockPrismaService = {
    profile: {
      findMany: vi.fn(),
    },
    interactionEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    profileMetric: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
    postView: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    follow: {
      count: vi.fn(),
    },
    like: {
      count: vi.fn(),
    },
  };

  beforeEach(async () => {
    mockQueue = { add: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: getQueueToken('analytics-processing'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    vi.clearAllMocks();
  });

  describe('handleDailyAggregation', () => {
    it('queues aggregation jobs for all eligible profiles', async () => {
      mockPrismaService.profile.findMany.mockResolvedValue([
        { id: 'prof-1' },
        { id: 'prof-2' },
      ]);

      await service.handleDailyAggregation();

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith('aggregate-creator', {
        profileId: 'prof-1',
      });
      expect(mockQueue.add).toHaveBeenCalledWith('aggregate-creator', {
        profileId: 'prof-2',
      });
    });

    it('catches database query errors gracefully', async () => {
      mockPrismaService.profile.findMany.mockRejectedValueOnce(
        new Error('DB disconnect'),
      );
      await expect(service.handleDailyAggregation()).resolves.not.toThrow();
    });
  });

  describe('logEvent and logEventsBatch', () => {
    it('should log a single event and trigger performance update for POST targets', async () => {
      mockPrismaService.interactionEvent.create.mockResolvedValueOnce({
        id: 'event-1',
      });
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'post-1',
        watchTime: 0,
        _count: { likes: 0, comments: 0, bookmarks: 0 },
      });
      mockPrismaService.post.update.mockResolvedValueOnce({ id: 'post-1' });

      const result = await service.logEvent(null, {
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
        dwellTime: 2000,
      });

      expect(result).toEqual({ id: 'event-1' });
      expect(mockPrismaService.interactionEvent.create).toHaveBeenCalledWith({
        data: {
          userId: null,
          eventType: UserEventType.IMPRESSION,
          targetId: 'post-1',
          targetType: 'POST',
          dwellTime: 2000,
        },
      });
    });

    it('should log an event for non-POST targets without updating performance score', async () => {
      mockPrismaService.interactionEvent.create.mockResolvedValueOnce({
        id: 'event-user',
      });

      await service.logEvent('userA', {
        eventType: UserEventType.PROFILE_CLICK,
        targetId: 'profile-1',
        targetType: 'PROFILE',
      });

      expect(mockPrismaService.post.findUnique).not.toHaveBeenCalled();
    });

    it('should catch logEvent errors gracefully', async () => {
      mockPrismaService.interactionEvent.create.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(
        service.logEvent('userA', {
          eventType: UserEventType.IMPRESSION,
          targetId: 'p-1',
          targetType: 'POST',
        }),
      ).resolves.toBeUndefined();
    });

    it('should log a batch of events and group dwell times by postId', async () => {
      mockPrismaService.interactionEvent.createMany.mockResolvedValueOnce({
        count: 2,
      });
      mockPrismaService.post.findUnique.mockResolvedValue({
        id: 'post-1',
        watchTime: 10,
        _count: { likes: 1, comments: 1, bookmarks: 1 },
      });
      mockPrismaService.post.update.mockResolvedValue({ id: 'post-1' });

      const result = await service.logEventsBatch('userA', {
        events: [
          {
            eventType: UserEventType.IMPRESSION,
            targetId: 'post-1',
            targetType: 'POST',
            dwellTime: 1000,
          },
          {
            eventType: UserEventType.DWELL_TIME,
            targetId: 'post-1',
            targetType: 'POST',
            dwellTime: 2000,
          },
          {
            eventType: UserEventType.PROFILE_CLICK,
            targetId: 'prof-1',
            targetType: 'PROFILE',
          },
        ],
      });

      expect(result).toEqual({ count: 2 });
    });

    it('should catch logEventsBatch errors gracefully', async () => {
      mockPrismaService.interactionEvent.createMany.mockRejectedValueOnce(
        new Error('Batch error'),
      );
      await expect(
        service.logEventsBatch(null, { events: [] }),
      ).resolves.toBeUndefined();
    });

    it('handles async performance score rejection in logEvent', async () => {
      mockPrismaService.interactionEvent.create.mockResolvedValueOnce({
        id: 'e-1',
      });
      vi.spyOn(service, 'updatePostPerformanceScore').mockRejectedValueOnce(
        new Error('crash'),
      );

      await service.logEvent('userA', {
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-crash',
        targetType: 'POST',
      });
    });

    it('handles async performance score rejection in logEventsBatch', async () => {
      mockPrismaService.interactionEvent.createMany.mockResolvedValueOnce({
        count: 1,
      });
      vi.spyOn(service, 'updatePostPerformanceScore').mockRejectedValueOnce(
        new Error('crash'),
      );

      await service.logEventsBatch('userA', {
        events: [
          {
            eventType: UserEventType.IMPRESSION,
            targetId: 'post-crash',
            targetType: 'POST',
          },
        ],
      });
    });
  });

  describe('updatePostPerformanceScore', () => {
    it('returns early when post is not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await service.updatePostPerformanceScore('non-existent');
      expect(mockPrismaService.post.update).not.toHaveBeenCalled();
    });

    it('catches update errors gracefully', async () => {
      mockPrismaService.post.findUnique.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(
        service.updatePostPerformanceScore('post-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('cleanupOldEvents', () => {
    it('should clean up old events', async () => {
      mockPrismaService.interactionEvent.deleteMany.mockResolvedValueOnce({
        count: 50,
      });
      await service.cleanupOldEvents();
      expect(mockPrismaService.interactionEvent.deleteMany).toHaveBeenCalled();
    });

    it('should catch cleanup errors gracefully', async () => {
      mockPrismaService.interactionEvent.deleteMany.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.cleanupOldEvents()).resolves.not.toThrow();
    });
  });

  describe('trackPostView, trackFrameLoop, trackFrameWatchTime', () => {
    it('increments views and records unique view when viewerId provided and no existing view', async () => {
      mockPrismaService.post.update.mockResolvedValueOnce({ id: 'p-1' });
      mockPrismaService.postView.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.postView.create.mockResolvedValueOnce({ id: 'pv-1' });

      await service.trackPostView('p-1', 'viewer-1');

      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { views: { increment: 1 } },
      });
      expect(mockPrismaService.postView.create).toHaveBeenCalledWith({
        data: { postId: 'p-1', viewerId: 'viewer-1' },
      });
    });

    it('does not create duplicate postView when already viewed', async () => {
      mockPrismaService.post.update.mockResolvedValueOnce({ id: 'p-1' });
      mockPrismaService.postView.findFirst.mockResolvedValueOnce({
        id: 'pv-1',
      });

      await service.trackPostView('p-1', 'viewer-1');
      expect(mockPrismaService.postView.create).not.toHaveBeenCalled();
    });

    it('catches trackPostView errors gracefully', async () => {
      mockPrismaService.post.update.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.trackPostView('p-1')).resolves.not.toThrow();
    });

    it('tracks frame loop and handles errors', async () => {
      mockPrismaService.post.update.mockResolvedValueOnce({ id: 'p-1' });
      await service.trackFrameLoop('p-1');
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'p-1', type: 'FRAME' },
        data: { loops: { increment: 1 } },
      });

      mockPrismaService.post.update.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(service.trackFrameLoop('p-1')).resolves.not.toThrow();
    });

    it('tracks frame watch time and handles errors', async () => {
      mockPrismaService.post.update.mockResolvedValueOnce({ id: 'p-1' });
      await service.trackFrameWatchTime('p-1', 4.8);
      expect(mockPrismaService.post.update).toHaveBeenCalledWith({
        where: { id: 'p-1', type: 'FRAME' },
        data: { watchTime: { increment: 5 } },
      });

      mockPrismaService.post.update.mockRejectedValueOnce(
        new Error('DB error'),
      );
      await expect(
        service.trackFrameWatchTime('p-1', 5),
      ).resolves.not.toThrow();
    });
  });

  describe('getCreatorDashboard and performDailyAggregation', () => {
    it('aggregates daily metrics and generates complete creator dashboard', async () => {
      mockPrismaService.follow.count.mockResolvedValue(100);
      mockPrismaService.post.count.mockResolvedValue(25);
      mockPrismaService.like.count.mockResolvedValue(300);
      mockPrismaService.post.aggregate.mockResolvedValue({
        _sum: { views: 5000 },
      });
      mockPrismaService.profileMetric.upsert.mockResolvedValue({});

      mockPrismaService.profileMetric.findMany.mockResolvedValue([
        {
          date: new Date('2026-03-01'),
          followers: 100,
          views: 500,
          reach: 600,
        },
      ]);
      mockPrismaService.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          views: 100,
          _count: { likes: 10, comments: 5, bookmarks: 2 },
        },
      ]);

      const dashboard = await service.getCreatorDashboard('prof-1', 30);

      expect(dashboard.summary).toEqual({
        totalPosts: 25,
        totalFollowers: 100,
        totalLikes: 300,
        engagementRate: 17,
        totalViews30d: 100,
      });
      expect(dashboard.charts.dailyMetrics).toEqual([
        {
          date: '2026-03-01',
          followers: 100,
          views: 500,
          reach: 600,
        },
      ]);
      expect(dashboard.recentPerformance).toHaveLength(1);
    });

    it('handles zero views in dashboard calculation safely', async () => {
      mockPrismaService.follow.count.mockResolvedValue(0);
      mockPrismaService.post.count.mockResolvedValue(0);
      mockPrismaService.like.count.mockResolvedValue(0);
      mockPrismaService.post.aggregate.mockResolvedValue({
        _sum: { views: null },
      });
      mockPrismaService.profileMetric.upsert.mockResolvedValue({});
      mockPrismaService.profileMetric.findMany.mockResolvedValue([]);
      mockPrismaService.post.findMany.mockResolvedValue([]);

      const dashboard = await service.getCreatorDashboard('prof-empty', 30);
      expect(dashboard.summary.engagementRate).toBe(0);
      expect(dashboard.summary.totalViews30d).toBe(0);
    });
  });

  describe('getPostInsights', () => {
    it('throws AppException if post is not found', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.getPostInsights('missing-post')).rejects.toThrow();
    });

    it('returns detailed post insights including daily views and interaction events', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-1',
        caption: 'Hello',
        createdAt: new Date(),
        views: 200,
        loops: 50,
        watchTime: 1200,
        _count: { likes: 20, comments: 10, bookmarks: 5 },
      });
      mockPrismaService.postView.findMany.mockResolvedValueOnce([
        { createdAt: new Date('2026-03-01T10:00:00Z') },
        { createdAt: new Date('2026-03-01T12:00:00Z') },
        { createdAt: new Date('2026-03-02T10:00:00Z') },
      ]);
      mockPrismaService.interactionEvent.findMany.mockResolvedValueOnce([
        { eventType: 'IMPRESSION', dwellTime: null },
        { eventType: 'IMPRESSION', dwellTime: null },
        { eventType: 'SHARE', dwellTime: null },
        { eventType: 'DWELL_TIME', dwellTime: 4500 },
      ]);

      const insights = await service.getPostInsights('p-1');

      expect(insights.post.impressions).toBe(2);
      expect(insights.post.shares).toBe(1);
      expect(insights.post.totalDwellTime).toBe(5);
      expect(insights.post.conversionRate).toBe(17.5); // (35 / 200) * 100
      expect(insights.chart).toEqual([
        { date: '2026-03-01', views: 2 },
        { date: '2026-03-02', views: 1 },
      ]);
    });

    it('calculates 0 conversion rate when post views is 0', async () => {
      mockPrismaService.post.findUnique.mockResolvedValueOnce({
        id: 'p-zero',
        caption: 'Zero views',
        createdAt: new Date(),
        views: 0,
        loops: 0,
        watchTime: 0,
        _count: { likes: 0, comments: 0, bookmarks: 0 },
      });
      mockPrismaService.postView.findMany.mockResolvedValueOnce([]);
      mockPrismaService.interactionEvent.findMany.mockResolvedValueOnce([]);

      const insights = await service.getPostInsights('p-zero');
      expect(insights.post.conversionRate).toBe(0);
    });
  });
});
