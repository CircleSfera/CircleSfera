import { CHAT_PINS_MAX } from '@circlesfera/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import {
  ChatSettingsUseCase,
  MUTED_ALWAYS,
  mutedUntilFor,
} from './chat-settings.use-case.js';

// Muting and pinning a chat: each member's own, on their own row only.

describe('ChatSettingsUseCase', () => {
  let prisma: {
    participant: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
    };
    $queryRaw: ReturnType<typeof vi.fn>;
    $transaction: ReturnType<typeof vi.fn>;
  };
  let useCase: ChatSettingsUseCase;

  beforeEach(() => {
    prisma = {
      participant: {
        findFirst: vi.fn(),
        update: vi.fn(async ({ data }) => data),
        count: vi.fn().mockResolvedValue(0),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    useCase = new ChatSettingsUseCase(prisma as unknown as PrismaService);
  });

  describe('how long a mute lasts', () => {
    const now = new Date('2026-11-09T12:00:00.000Z');
    it.each([
      ['1h', '2026-11-09T13:00:00.000Z'],
      ['8h', '2026-11-09T20:00:00.000Z'],
      ['1w', '2026-11-16T12:00:00.000Z'],
    ] as const)('%s ends when it should', (duration, end) => {
      expect(mutedUntilFor(duration, now)).toEqual(new Date(end));
    });
    it('always has no end', () => {
      expect(mutedUntilFor('always', now)).toBe(MUTED_ALWAYS);
    });
  });

  it('mutes the member’s own row of the chat, found by the session Profile', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: 'row-me' });

    await useCase.mute('me', 'c-1', 'always');

    expect(prisma.participant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: 'c-1', profileId: 'me', deletedAt: null },
      }),
    );
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-me' },
        data: { mutedUntil: MUTED_ALWAYS },
      }),
    );
  });

  it('refuses a chat the Profile is not in', async () => {
    prisma.participant.findFirst.mockResolvedValue(null);

    await expect(useCase.mute('me', 'c-x', '1h')).rejects.toMatchObject({
      status: 404,
    });
    await expect(useCase.pin('me', 'c-x')).rejects.toMatchObject({
      status: 404,
    });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('pins a chat of the inbox under a lock on the Profile', async () => {
    prisma.participant.findFirst.mockResolvedValue({
      id: 'row-me',
      hasAccepted: true,
      pinnedAt: null,
    });

    await useCase.pin('me', 'c-1');

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.participant.count).toHaveBeenCalledWith({
      where: {
        profileId: 'me',
        deletedAt: null,
        hasAccepted: true,
        pinnedAt: { not: null },
      },
    });
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'row-me' },
        data: { pinnedAt: expect.any(Date) },
      }),
    );
  });

  it(`refuses a pin past ${CHAT_PINS_MAX}`, async () => {
    prisma.participant.findFirst.mockResolvedValue({
      id: 'row-me',
      hasAccepted: true,
      pinnedAt: null,
    });
    prisma.participant.count.mockResolvedValue(CHAT_PINS_MAX);

    await expect(useCase.pin('me', 'c-1')).rejects.toMatchObject({
      status: 409,
    });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('refuses to pin a message request', async () => {
    prisma.participant.findFirst.mockResolvedValue({
      id: 'row-me',
      hasAccepted: false,
      pinnedAt: null,
    });

    await expect(useCase.pin('me', 'c-1')).rejects.toMatchObject({
      status: 400,
    });
  });

  it('changes nothing for a chat already pinned', async () => {
    const pinnedAt = new Date('2026-11-01T00:00:00.000Z');
    prisma.participant.findFirst.mockResolvedValue({
      id: 'row-me',
      hasAccepted: true,
      pinnedAt,
    });

    expect(await useCase.pin('me', 'c-1')).toEqual({
      conversationId: 'c-1',
      pinnedAt,
    });
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('unmutes and unpins', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: 'row-me' });

    await useCase.unmute('me', 'c-1');
    await useCase.unpin('me', 'c-1');

    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mutedUntil: null } }),
    );
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { pinnedAt: null } }),
    );
  });
});
