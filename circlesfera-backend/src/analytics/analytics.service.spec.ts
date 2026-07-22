import { Test, type TestingModule } from '@nestjs/testing';
import { UserEventType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const mockPrismaService = {
    interactionEvent: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    userMetric: {
      upsert: vi.fn(),
    },
    post: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    vi.clearAllMocks();
  });

  it('should log a single event', async () => {
    mockPrismaService.interactionEvent.create.mockResolvedValueOnce({
      id: 'event-1',
    });
    const result = await service.logEvent('userA', {
      eventType: UserEventType.IMPRESSION,
      targetId: 'post-1',
      targetType: 'POST',
    });
    expect(result).toEqual({ id: 'event-1' });
    expect(mockPrismaService.interactionEvent.create).toHaveBeenCalledWith({
      data: {
        userId: 'userA',
        eventType: UserEventType.IMPRESSION,
        targetId: 'post-1',
        targetType: 'POST',
        dwellTime: undefined,
      },
    });
  });

  it('should log a batch of events', async () => {
    mockPrismaService.interactionEvent.createMany.mockResolvedValueOnce({
      count: 2,
    });
    const result = await service.logEventsBatch('userA', {
      events: [
        {
          eventType: UserEventType.IMPRESSION,
          targetId: 'post-1',
          targetType: 'POST',
        },
        {
          eventType: UserEventType.DWELL_TIME,
          targetId: 'post-1',
          targetType: 'POST',
          dwellTime: 500,
        },
      ],
    });
    expect(result).toEqual({ count: 2 });
    expect(mockPrismaService.interactionEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'userA',
          eventType: UserEventType.IMPRESSION,
          targetId: 'post-1',
          targetType: 'POST',
          dwellTime: undefined,
        },
        {
          userId: 'userA',
          eventType: UserEventType.DWELL_TIME,
          targetId: 'post-1',
          targetType: 'POST',
          dwellTime: 500,
        },
      ],
    });
  });

  it('should clean up old events', async () => {
    mockPrismaService.interactionEvent.deleteMany.mockResolvedValueOnce({
      count: 50,
    });
    await service.cleanupOldEvents();
    expect(mockPrismaService.interactionEvent.deleteMany).toHaveBeenCalled();
  });

  it('should recalculate post performance score based on likes, comments, bookmarks and dwellTime', async () => {
    mockPrismaService.post.findUnique.mockResolvedValueOnce({
      id: 'post-1',
      watchTime: 10,
      _count: { likes: 5, comments: 2, bookmarks: 1 },
    });
    mockPrismaService.post.update.mockResolvedValueOnce({ id: 'post-1' });

    await service.updatePostPerformanceScore('post-1', 2000); // +2s

    expect(mockPrismaService.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: expect.objectContaining({
        watchTime: 12,
        views: { increment: 1 },
        performanceScore: expect.any(Number),
      }),
    });
  });
});
