import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { LiveService } from './live.service.js';

describe('LiveService', () => {
  let service: LiveService;

  const mockServer = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  };

  const mockGateway = {
    server: mockServer,
  };

  const mockPrismaService = {
    liveStream: {
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
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
        { provide: AppGateway, useValue: mockGateway },
      ],
    }).compile();

    service = module.get<LiveService>(LiveService);
    vi.clearAllMocks();
    // Restore chain mock after clearAllMocks
    mockServer.to.mockReturnThis();
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
    it('should update active streams status to ENDED and assign replayUrl', async () => {
      mockPrismaService.liveStream.findMany.mockResolvedValue([
        { id: 'stream-1', hostId: 'user-1', hlsUrl: null },
      ]);
      mockPrismaService.liveStream.update.mockResolvedValue({ id: 'stream-1', status: 'ENDED' });

      const result = await service.endStream('user-1');
      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: expect.objectContaining({
          status: 'ENDED',
          replayUrl: 'https://cdn.circlesfera.com/vod/replays/stream-1.m3u8',
        }),
      });
      expect(result).toEqual({ success: true, endedCount: 1 });
    });
  });

  describe('getActiveStreams', () => {
    it('should return all active streams ordered by startedAt', async () => {
      const mockStreams = [{ id: 'stream-1', status: 'LIVE' }];
      mockPrismaService.liveStream.findMany.mockResolvedValue(mockStreams);

      const result = await service.getActiveStreams();
      expect(result).toEqual(mockStreams);
    });
  });

  describe('inviteCoHost', () => {
    it('should throw ForbiddenException if caller is not the host', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', hostId: 'host-1', status: 'LIVE', coHostId: null,
      });

      await expect(
        service.inviteCoHost('stream-1', 'attacker-99', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if invitee does not exist', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', hostId: 'host-1', status: 'LIVE', coHostId: null, title: 'Test',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteCoHost('stream-1', 'host-1', 'ghost-user'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update coHostId and emit socket events on success', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', hostId: 'host-1', status: 'LIVE', coHostId: null, title: 'Live!',
      });
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce({ id: 'user-2', profile: { username: 'cohost_user' } })
        .mockResolvedValueOnce({ id: 'host-1', profile: { username: 'host_user', avatar: null } });
      mockPrismaService.liveStream.update.mockResolvedValue({});

      const result = await service.inviteCoHost('stream-1', 'host-1', 'user-2');

      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: { coHostId: 'user-2' },
      });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-2');
      expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_invite', expect.objectContaining({
        streamId: 'stream-1',
      }));
      expect(result).toEqual({ success: true, coHostId: 'user-2' });
    });
  });

  describe('acceptCoHostInvite', () => {
    it('should throw ForbiddenException if user is not the invited co-host', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', status: 'LIVE', coHostId: 'other-user',
      });

      await expect(
        service.acceptCoHostInvite('stream-1', 'wrong-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return a LiveKit publisher token for the co-host', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', status: 'LIVE', coHostId: 'user-2',
      });

      const result = await service.acceptCoHostInvite('stream-1', 'user-2');
      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
      expect(result.streamId).toBe('stream-1');
    });
  });

  describe('removeCoHost', () => {
    it('should throw ForbiddenException if caller is not the host', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', hostId: 'host-1', coHostId: 'user-2',
      });

      await expect(
        service.removeCoHost('stream-1', 'attacker'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should clear coHostId and emit removal events', async () => {
      mockPrismaService.liveStream.findUnique.mockResolvedValue({
        id: 'stream-1', hostId: 'host-1', coHostId: 'user-2',
      });
      mockPrismaService.liveStream.update.mockResolvedValue({});

      const result = await service.removeCoHost('stream-1', 'host-1');

      expect(mockPrismaService.liveStream.update).toHaveBeenCalledWith({
        where: { id: 'stream-1' },
        data: { coHostId: null },
      });
      expect(mockServer.to).toHaveBeenCalledWith('user:user-2');
      expect(mockServer.emit).toHaveBeenCalledWith('live:cohost_removed', { streamId: 'stream-1' });
      expect(result).toEqual({ success: true });
    });
  });
});

