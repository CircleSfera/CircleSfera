import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebrtcSignalingService } from './webrtc-signaling.service.js';

describe('WebrtcSignalingService', () => {
  let service: WebrtcSignalingService;

  const mockPrismaService = {
    block: {
      findFirst: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrismaService.block.findFirst.mockResolvedValue(null);
    mockPrismaService.conversation.findFirst.mockResolvedValue({
      id: 'conv-1',
      isGroup: false,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebrtcSignalingService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<WebrtcSignalingService>(WebrtcSignalingService);
  });

  describe('authorizeAndInitiateCall', () => {
    it('rejects self-calling', async () => {
      const result = await service.authorizeAndInitiateCall(
        'user-1',
        'user-1',
        'audio',
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('SELF_CALL');
    });

    it('rejects call if either user blocked the other', async () => {
      mockPrismaService.block.findFirst.mockResolvedValue({ id: 'block-1' });

      const result = await service.authorizeAndInitiateCall(
        'user-1',
        'user-2',
        'video',
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('BLOCKED');
    });

    it('rejects call if no active 1-on-1 conversation exists', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValue(null);

      const result = await service.authorizeAndInitiateCall(
        'user-1',
        'user-2',
        'audio',
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('NO_CONVERSATION');
    });

    it('successfully initiates call when relationship checks pass', async () => {
      const result = await service.authorizeAndInitiateCall(
        'user-1',
        'user-2',
        'video',
      );
      expect(result.ok).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.state).toBe('RINGING');
      expect(result.session?.callerId).toBe('user-1');
      expect(result.session?.calleeId).toBe('user-2');
    });

    it('rejects if caller is already in a call (BUSY)', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');

      // Attempt second call from user-1
      const secondCall = await service.authorizeAndInitiateCall(
        'user-1',
        'user-3',
        'audio',
      );
      expect(secondCall.ok).toBe(false);
      expect(secondCall.reason).toBe('BUSY');
    });

    it('rejects if callee is already in a call (BUSY)', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');

      // Attempt call to busy user-2 from user-3
      const secondCall = await service.authorizeAndInitiateCall(
        'user-3',
        'user-2',
        'audio',
      );
      expect(secondCall.ok).toBe(false);
      expect(secondCall.reason).toBe('BUSY');
    });
  });

  describe('authorizeAndAcceptCall', () => {
    it('rejects acceptance if no ringing call exists for receiver', () => {
      const result = service.authorizeAndAcceptCall('user-2', 'user-1');
      expect(result.ok).toBe(false);
    });

    it('rejects acceptance if caller does not match initiating caller', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');

      const result = service.authorizeAndAcceptCall('user-2', 'attacker-user');
      expect(result.ok).toBe(false);
    });

    it('accepts ringing call and transitions state to ACTIVE', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');

      const result = service.authorizeAndAcceptCall('user-2', 'user-1');
      expect(result.ok).toBe(true);
      expect(result.session?.state).toBe('ACTIVE');

      // Cannot accept a second time (already active)
      const secondAccept = service.authorizeAndAcceptCall('user-2', 'user-1');
      expect(secondAccept.ok).toBe(false);
    });
  });

  describe('authorizeAndDeclineCall', () => {
    it('rejects decline if no ringing call exists', () => {
      const result = service.authorizeAndDeclineCall('user-2', 'user-1');
      expect(result.ok).toBe(false);
    });

    it('declines call, removes session, and frees participants', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');

      const decline = service.authorizeAndDeclineCall('user-2', 'user-1');
      expect(decline.ok).toBe(true);

      // Now user-1 should be free to call again
      const newCall = await service.authorizeAndInitiateCall(
        'user-1',
        'user-3',
        'audio',
      );
      expect(newCall.ok).toBe(true);
    });
  });

  describe('authorizeSignal', () => {
    it('rejects signal if sender is not in any call', () => {
      expect(service.authorizeSignal('user-1', 'user-2')).toBe(false);
    });

    it('rejects signal if target is not the authorized peer', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');
      service.authorizeAndAcceptCall('user-2', 'user-1');

      // user-1 tries to signal user-3
      expect(service.authorizeSignal('user-1', 'user-3')).toBe(false);
      // attacker tries to signal user-1
      expect(service.authorizeSignal('attacker', 'user-1')).toBe(false);
    });

    it('authorizes signal between caller and callee in active call', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');
      service.authorizeAndAcceptCall('user-2', 'user-1');

      expect(service.authorizeSignal('user-1', 'user-2')).toBe(true);
      expect(service.authorizeSignal('user-2', 'user-1')).toBe(true);
    });
  });

  describe('authorizeAndEndCall', () => {
    it('rejects hangup if not in a call with target', () => {
      expect(service.authorizeAndEndCall('user-1', 'user-2')).toEqual({
        ok: false,
      });
    });

    it('ends call and cleans up session', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');
      service.authorizeAndAcceptCall('user-2', 'user-1');

      const end = service.authorizeAndEndCall('user-1', 'user-2');
      expect(end).toEqual({ ok: true, peerId: 'user-2' });

      // After hangup, signaling is rejected
      expect(service.authorizeSignal('user-1', 'user-2')).toBe(false);
    });
  });

  describe('handleUserDisconnect', () => {
    it('cleans up session and returns peer to notify', async () => {
      await service.authorizeAndInitiateCall('user-1', 'user-2', 'audio');
      service.authorizeAndAcceptCall('user-2', 'user-1');

      const terminated = service.handleUserDisconnect('user-1');
      expect(terminated).toEqual([{ peerId: 'user-2', state: 'ACTIVE' }]);

      // User 2 is now free
      expect(service.getSessionForUser('user-2')).toBeUndefined();
    });

    it('returns empty array if disconnected user was not in any call', () => {
      expect(service.handleUserDisconnect('user-idle')).toEqual([]);
    });
  });

  describe('getCallerProfile', () => {
    it('returns formatted caller profile when profile exists', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue({
        id: 'prof-1',
        username: 'caller1',
        fullName: 'Caller One',
        avatar: 'avatar.jpg',
      });

      const result = await service.getCallerProfile('prof-1');

      expect(mockPrismaService.profile.findUnique).toHaveBeenCalledWith({
        where: { id: 'prof-1' },
        select: {
          id: true,
          username: true,
          fullName: true,
          avatar: true,
        },
      });
      expect(result).toEqual({
        id: 'prof-1',
        profile: {
          username: 'caller1',
          fullName: 'Caller One',
          avatar: 'avatar.jpg',
        },
      });
    });

    it('returns null when caller profile is not found', async () => {
      mockPrismaService.profile.findUnique.mockResolvedValue(null);

      const result = await service.getCallerProfile('nonexistent');
      expect(result).toBeNull();
    });
  });
});
