import { Test, type TestingModule } from '@nestjs/testing';
import { UserEventType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    logEvent: vi.fn(),
    logEventsBatch: vi.fn(),
    getCreatorDashboard: vi.fn(),
    trackPostView: vi.fn(),
    trackFrameLoop: vi.fn(),
    trackFrameWatchTime: vi.fn(),
    getPostInsights: vi.fn(),
    performDailyAggregation: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call logEvent', async () => {
    const dto = {
      eventType: UserEventType.IMPRESSION,
      targetId: 'post-1',
      targetType: 'POST',
    };
    await controller.logEvent('user-1', dto);
    expect(service.logEvent).toHaveBeenCalledWith('user-1', dto);
  });

  it('should call logEventsBatch', async () => {
    const dto = {
      events: [
        {
          eventType: UserEventType.IMPRESSION,
          targetId: 'post-1',
          targetType: 'POST',
        },
      ],
    };
    await controller.logEventsBatch('user-1', dto);
    expect(service.logEventsBatch).toHaveBeenCalledWith('user-1', dto);
  });
});
