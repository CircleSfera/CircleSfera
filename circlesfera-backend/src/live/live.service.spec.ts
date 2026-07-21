import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { LiveService } from './live.service.js';

describe('LiveService', () => {
  let service: LiveService;

  const mockPrismaService = {
    liveStream: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'LIVEKIT_API_KEY') return 'test_key';
      if (key === 'LIVEKIT_API_SECRET') return 'test_secret_32_bytes_long_key_mock_secret!';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<LiveService>(LiveService);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startStream', () => {
    it('should end existing streams and create a new stream with token', async () => {
      const mockStream = { id: 'stream-1', hostId: 'user-1', status: 'LIVE', title: 'Test Stream' };
      mockPrismaService.liveStream.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.liveStream.create.mockResolvedValue(mockStream);

      const result = await service.startStream('user-1', 'Test Stream');

      expect(mockPrismaService.liveStream.updateMany).toHaveBeenCalledWith({
        where: { hostId: 'user-1', status: 'LIVE' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(mockPrismaService.liveStream.create).toHaveBeenCalledWith({
        data: {
          hostId: 'user-1',
          title: 'Test Stream',
          status: 'LIVE',
        },
      });
      expect(result.stream).toEqual(mockStream);
      expect(typeof result.token).toBe('string');
    });
  });

  describe('getViewerToken', () => {
    it('should throw NotFoundException if stream does not exist or is ended', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue(null);

      await expect(service.getViewerToken('stream-invalid', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return viewer token for an active live stream', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1',
        status: 'LIVE',
      });

      const result = await service.getViewerToken('stream-1', 'user-2');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
    });
  });

  describe('endStream', () => {
    it('should update active streams status to ENDED', async () => {
      mockPrismaService.liveStream.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.endStream('user-1');
      expect(mockPrismaService.liveStream.updateMany).toHaveBeenCalledWith({
        where: { hostId: 'user-1', status: 'LIVE' },
        data: { status: 'ENDED', endedAt: expect.any(Date) },
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('getActiveStreams', () => {
    it('should return all active streams ordered by startedAt', async () => {
      const mockStreams = [{ id: 'stream-1', status: 'LIVE' }];
      mockPrismaService.liveStream.findMany.mockResolvedValue(mockStreams);

      const result = await service.getActiveStreams();
      expect(mockPrismaService.liveStream.findMany).toHaveBeenCalledWith({
        where: { status: 'LIVE' },
        include: {
          host: {
            include: { profile: true },
          },
        },
        orderBy: { startedAt: 'desc' },
      });
      expect(result).toEqual(mockStreams);
    });
  });
});
