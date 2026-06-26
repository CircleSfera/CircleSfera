import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  const mockPrismaService = {
    user: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    follow: {
      findMany: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSuggestions', () => {
    it('should return user suggestions excluding follows and blocks', async () => {
      const mockSuggestions = [
        {
          id: 's1',
          profile: { username: 'user_s1' },
          _count: { followers: 10 },
        },
      ];
      mockPrismaService.user.findMany.mockResolvedValue(mockSuggestions);

      const limit = 10;
      const result = await service.getSuggestions('1', limit);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('s1');
      
      const lastCallArgs = vi.mocked(mockPrismaService.user.findMany).mock
        .calls[0][0] as any;
      expect(lastCallArgs.where.followers.none.followerId).toBe('1');
      expect(lastCallArgs.where.blocking.none.blockedId).toBe('1');
      expect(lastCallArgs.where.blockedBy.none.blockerId).toBe('1');
      expect(lastCallArgs.take).toBe(limit);
    });
  });

  it('should ban a user', async () => {
    mockPrismaService.user.update.mockResolvedValue({
      id: '1',
      isActive: false,
    });
    const result = await service.banUser('1');
    expect(result.isActive).toBe(false);
  });

  it('should unban a user', async () => {
    mockPrismaService.user.update.mockResolvedValue({
      id: '1',
      isActive: true,
    });
    const result = await service.unbanUser('1');
    expect(result.isActive).toBe(true);
  });
});
