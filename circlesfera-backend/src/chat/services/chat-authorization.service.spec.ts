import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../common/errors/app.exception.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { ChatAuthorizationService } from './chat-authorization.service.js';

describe('ChatAuthorizationService', () => {
  let service: ChatAuthorizationService;
  let mockPrisma: { participant: { findFirst: ReturnType<typeof vi.fn> } };

  beforeEach(() => {
    mockPrisma = { participant: { findFirst: vi.fn() } };
    service = new ChatAuthorizationService(
      mockPrisma as unknown as PrismaService,
    );
  });

  describe('assertParticipant', () => {
    it('throws Forbidden when not a participant', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(
        service.assertParticipant('conv-1', 'prof-1'),
      ).rejects.toThrow(AppException);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', profileId: 'prof-1' },
      });
    });

    it('returns the participant when found', async () => {
      const participant = { id: 'part-1', isAdmin: false };
      mockPrisma.participant.findFirst.mockResolvedValue(participant);

      const result = await service.assertParticipant('conv-1', 'prof-1');
      expect(result).toBe(participant);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', profileId: 'prof-1' },
      });
    });
  });

  describe('assertGroupAdmin', () => {
    it('throws Forbidden when not a participant at all', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      await expect(
        service.assertGroupAdmin('conv-1', 'prof-1'),
      ).rejects.toThrow(AppException);
      expect(mockPrisma.participant.findFirst).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', profileId: 'prof-1' },
      });
    });

    it('throws Forbidden when a participant but not admin', async () => {
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: 'part-1',
        isAdmin: false,
      });

      await expect(
        service.assertGroupAdmin('conv-1', 'prof-1'),
      ).rejects.toThrow(AppException);
    });

    it('returns the participant when an admin', async () => {
      const participant = { id: 'part-1', isAdmin: true };
      mockPrisma.participant.findFirst.mockResolvedValue(participant);

      const result = await service.assertGroupAdmin('conv-1', 'prof-1');
      expect(result).toBe(participant);
    });
  });
});
