import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreatorService } from './creator.service.js';

describe('CreatorService', () => {
  let service: CreatorService;

  const mockPrismaService = {
    post: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
    story: {
      count: vi.fn(),
    },
    storyView: {
      count: vi.fn(),
    },
    follow: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    like: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    comment: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    bookmark: {
      count: vi.fn(),
    },
    promotion: {
      count: vi.fn(),
    },
    creatorSubscription: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };

  const mockAnalyticsService = {
    trackEvent: vi.fn(),
  };

  const mockStripeService = {
    createAccountLink: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatorService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: StripeService, useValue: mockStripeService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<CreatorService>(CreatorService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStats', () => {
    it('should return aggregated creator statistics', async () => {
      mockPrismaService.post.count.mockResolvedValue(10);
      mockPrismaService.story.count.mockResolvedValue(5);
      mockPrismaService.storyView.count.mockResolvedValue(150);
      mockPrismaService.follow.count.mockResolvedValue(100);
      mockPrismaService.follow.findMany.mockResolvedValue([]);
      mockPrismaService.like.count.mockResolvedValue(500);
      mockPrismaService.like.findMany.mockResolvedValue([]);
      mockPrismaService.comment.count.mockResolvedValue(50);
      mockPrismaService.bookmark.count.mockResolvedValue(20);
      mockPrismaService.promotion.count.mockResolvedValue(2);
      mockPrismaService.creatorSubscription.findMany.mockResolvedValue([]);
      mockPrismaService.post.aggregate.mockResolvedValue({
        _sum: { views: 2000 },
      });

      const stats = await service.getStats('creator-1');
      expect(stats).toHaveProperty('postCount');
      expect(stats).toHaveProperty('followerCount');
      expect(stats).toHaveProperty('totalReach');
    });
  });
});
