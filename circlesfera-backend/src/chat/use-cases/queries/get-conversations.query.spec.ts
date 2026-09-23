import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { GetConversationsQuery } from './get-conversations.query.js';

describe('GetConversationsQuery', () => {
  let query: GetConversationsQuery;
  let mockPrisma: {
    conversation: {
      findMany: ReturnType<typeof vi.fn>;
    };
  };
  let mockCryptoService: {
    decrypt: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findMany: vi.fn(),
      },
    };
    mockCryptoService = {
      decrypt: vi.fn((c: string) => `decrypted_${c}`),
    };
    query = new GetConversationsQuery(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
    );
  });

  it('fetches conversations for profile and decrypts last message content', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        messages: [{ id: 'msg-1', content: 'enc_hello' }],
      },
      {
        id: 'conv-2',
        messages: [],
      },
      {
        id: 'conv-3',
        messages: [{ id: 'msg-2', content: '' }],
      },
    ]);

    const result = await query.execute('prof-1');

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
      where: {
        participants: {
          some: {
            profileId: 'prof-1',
            deletedAt: null,
          },
        },
      },
      take: 100,
      include: expect.any(Object),
      orderBy: { updatedAt: 'desc' },
    });
    expect(mockCryptoService.decrypt).toHaveBeenCalledWith('enc_hello');
    expect(result[0].messages[0].content).toBe('decrypted_enc_hello');
    expect(result[1].messages).toEqual([]);
    expect(result[2].messages[0].content).toBe('');
  });
});
