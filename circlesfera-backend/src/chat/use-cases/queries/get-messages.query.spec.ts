import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';
import { GetMessagesQuery } from './get-messages.query.js';

describe('GetMessagesQuery', () => {
  let query: GetMessagesQuery;
  let mockPrisma: {
    participant: { findFirst: ReturnType<typeof vi.fn> };
    profile: { findUnique: ReturnType<typeof vi.fn> };
    message: { findMany: ReturnType<typeof vi.fn> };
  };
  let mockCryptoService: { decrypt: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      participant: { findFirst: vi.fn() },
      profile: { findUnique: vi.fn() },
      message: { findMany: vi.fn() },
    };
    mockCryptoService = {
      decrypt: vi.fn((c: string) => `decrypted_${c}`),
    };
    query = new GetMessagesQuery(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
      new ChatAuthorizationService(mockPrisma as unknown as PrismaService),
    );
  });

  it('throws Forbidden if profileId is passed and caller is not a participant', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue(null);

    await expect(query.execute('conv-1', 50, 'prof-1')).rejects.toThrow(
      AppException,
    );
  });

  it('fetches and decrypts messages with clearedAt filter when set', async () => {
    const clearedDate = new Date('2026-01-01');
    mockPrisma.participant.findFirst.mockResolvedValue({
      clearedAt: clearedDate,
    });
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-1' });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        content: 'enc_hello',
        senderId: 'prof-1',
        isLocked: false,
      },
    ]);

    const result = await query.execute('conv-1', 50, 'prof-1');

    expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          conversationId: 'conv-1',
          createdAt: { gt: clearedDate },
        },
        take: 50,
      }),
    );
    expect(result[0].content).toBe('decrypted_enc_hello');
  });

  it('masks locked message content and media if viewer has not unlocked it', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ clearedAt: null });
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-viewer' });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-locked',
        content: 'enc_secret',
        senderId: 'prof-creator',
        isLocked: true,
        url: 'https://cdn/secret.jpg',
        standardUrl: 'https://cdn/secret-std.jpg',
        thumbnailUrl: 'https://cdn/secret-thumb.jpg',
        mediaType: 'image',
        voiceUrl: 'https://cdn/secret-voice.m4a',
        messageUnlocks: [],
      },
    ]);

    const result = await query.execute('conv-1', 50, 'prof-viewer');

    expect(result[0].content).toBe('This message is locked. Pay to unlock.');
    expect(result[0].url).toBeNull();
    expect(result[0].standardUrl).toBeNull();
    expect(result[0].thumbnailUrl).toBeNull();
    expect(result[0].mediaType).toBeNull();
    expect(result[0].voiceUrl).toBeNull();
  });

  it('does not mask locked message if viewer is the sender or has unlocked it', async () => {
    mockPrisma.participant.findFirst.mockResolvedValue({ clearedAt: null });
    mockPrisma.profile.findUnique.mockResolvedValue({ userId: 'user-viewer' });

    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-locked-unlocked',
        content: 'enc_unlocked_msg',
        senderId: 'prof-other',
        isLocked: true,
        url: 'https://cdn/media.jpg',
        messageUnlocks: [{ id: 'unlock-1' }],
      },
      {
        id: 'msg-locked-own',
        content: 'enc_my_locked_msg',
        senderId: 'prof-viewer',
        isLocked: true,
        url: 'https://cdn/media2.jpg',
        messageUnlocks: [],
      },
    ]);

    const result = await query.execute('conv-1', 50, 'prof-viewer');

    expect(result[0].content).toBe('decrypted_enc_unlocked_msg');
    expect(result[0].url).toBe('https://cdn/media.jpg');
    expect(result[1].content).toBe('decrypted_enc_my_locked_msg');
    expect(result[1].url).toBe('https://cdn/media2.jpg');
  });

  it('prefers the linked Media rows over the inline columns, and exposes status', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      {
        id: 'msg-media',
        content: null,
        senderId: 'prof-1',
        isLocked: false,
        url: 'https://cdn/stale.mp4',
        standardUrl: null,
        thumbnailUrl: null,
        voiceUrl: 'https://cdn/stale-voice.m4a',
        media: {
          url: 'https://cdn/stale.mp4',
          standardUrl: null,
          thumbnailUrl: null,
          status: 'PENDING',
        },
        voiceMedia: { url: 'https://cdn/resolved-voice.m4a' },
      },
    ]);

    const result = await query.execute('conv-1', 50);

    expect(result[0].status).toBe('PENDING');
    expect(result[0].voiceUrl).toBe('https://cdn/resolved-voice.m4a');
    expect(result[0]).not.toHaveProperty('media');
    expect(result[0]).not.toHaveProperty('voiceMedia');
  });

  it('allows fetching without profileId (system usage) and handles null content', async () => {
    mockPrisma.message.findMany.mockResolvedValue([
      { id: 'msg-sys', content: 'enc_system' },
      { id: 'msg-null-content', content: null },
    ]);

    const result = await query.execute('conv-1', 20);

    expect(mockPrisma.participant.findFirst).not.toHaveBeenCalled();
    expect(result[0].content).toBe('decrypted_enc_system');
    expect(result[1].content).toBeNull();
  });
});
