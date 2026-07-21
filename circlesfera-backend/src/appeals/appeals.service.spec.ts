import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppealsService } from './appeals.service.js';

describe('AppealsService', () => {
  let service: AppealsService;

  const mockPrismaService = {
    appeal: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppealsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AppealsService>(AppealsService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an appeal', async () => {
      const dto = {
        targetType: 'ACCOUNT_BAN' as any,
        targetId: 'ban-1',
        reason: 'Unfair ban, I did not break rules',
      };

      mockPrismaService.appeal.create.mockResolvedValue({
        id: 'appeal-1',
        userId: 'user-1',
        ...dto,
      });

      const result = await service.create('user-1', dto);
      expect(mockPrismaService.appeal.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          targetType: dto.targetType,
          targetId: dto.targetId,
          reason: dto.reason,
        },
      });
      expect(result).toHaveProperty('id', 'appeal-1');
    });
  });

  describe('findMyUserAppeals', () => {
    it('should return appeals for specified user', async () => {
      mockPrismaService.appeal.findMany.mockResolvedValue([
        { id: 'appeal-1', userId: 'user-1' },
      ]);

      const result = await service.findMyUserAppeals('user-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should throw NotFoundException if appeal does not exist', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-appeal')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return appeal if exists', async () => {
      mockPrismaService.appeal.findUnique.mockResolvedValue({
        id: 'appeal-1',
        userId: 'user-1',
      });

      const result = await service.findOne('appeal-1');
      expect(result).toHaveProperty('id', 'appeal-1');
    });
  });
});
