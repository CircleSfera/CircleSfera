import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadsService } from '../uploads/uploads.service.js';
import { MaintenanceService } from './maintenance.service.js';

describe('MaintenanceService', () => {
  let service: MaintenanceService;

  const mockPrismaService = {
    story: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    promotion: {
      updateMany: vi.fn(),
    },
  };

  const mockUploadsService = {
    deleteFile: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: UploadsService, useValue: mockUploadsService },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('cleanupExpiredStories', () => {
    it('should return early if no expired stories exist', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([]);

      await service.cleanupExpiredStories();
      expect(mockPrismaService.story.findMany).toHaveBeenCalled();
      expect(mockUploadsService.deleteFile).not.toHaveBeenCalled();
    });

    it('should delete expired story media and records', async () => {
      mockPrismaService.story.findMany.mockResolvedValue([
        {
          id: 's-1',
          url: 'https://cdn.example.com/story.jpg',
          thumbnailUrl: 'https://cdn.example.com/story_thumb.jpg',
        },
      ]);
      mockPrismaService.story.delete.mockResolvedValue({ id: 's-1' });

      await service.cleanupExpiredStories();
      expect(mockUploadsService.deleteFile).toHaveBeenCalledWith(
        'https://cdn.example.com/story.jpg',
      );
      expect(mockPrismaService.story.delete).toHaveBeenCalledWith({
        where: { id: 's-1' },
      });
    });
  });

  describe('checkExpiredPromotions', () => {
    it('should update status for expired promotions', async () => {
      mockPrismaService.promotion.updateMany.mockResolvedValue({ count: 2 });

      await service.checkExpiredPromotions();
      expect(mockPrismaService.promotion.updateMany).toHaveBeenCalled();
    });
  });
});
