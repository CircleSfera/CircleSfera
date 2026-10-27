import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../../../common/pagination/keyset.util.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import {
  CONVERSATION_PAGE_DEFAULT,
  CONVERSATION_PAGE_MAX,
  GetConversationsQuery,
} from './get-conversations.query.js';

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
            hasAccepted: true,
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

  it('never takes a notice from the app as the latest message, in the list or the unread count', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    await query.execute('prof-1');

    const { include } = mockPrisma.conversation.findMany.mock.calls[0][0];
    expect(include.messages).toMatchObject({
      where: { kind: 'USER' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
  });

  it('fetches request conversations when folder is requests', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    await query.execute('prof-1', 'requests');

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          participants: {
            some: {
              profileId: 'prof-1',
              deletedAt: null,
              hasAccepted: false,
            },
          },
        },
      }),
    );
  });

  describe('a page of the list', () => {
    const conv = (id: string, updatedAt: string) => ({
      id,
      updatedAt: new Date(updatedAt),
      messages: [{ id: `msg-${id}`, content: `enc_${id}` }],
    });

    it('reads one more than the page to know whether another follows, and names where the next one starts', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c3', '2026-10-18T10:00:00.000Z'),
        conv('c2', '2026-10-18T09:00:00.000Z'),
        conv('c1', '2026-10-18T08:00:00.000Z'),
      ]);

      const page = await query.executePage('prof-1', 'inbox', undefined, 2);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: {
          participants: {
            some: { profileId: 'prof-1', deletedAt: null, hasAccepted: true },
          },
        },
        take: 3,
        include: expect.any(Object),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });
      expect(page.items.map((c) => c.id)).toEqual(['c3', 'c2']);
      expect(page.items[0].messages[0].content).toBe('decrypted_enc_c3');
      expect(decodeKeysetCursor(page.nextCursor as string)).toEqual({
        createdAt: new Date('2026-10-18T09:00:00.000Z'),
        id: 'c2',
      });
    });

    it('starts the next page strictly after the conversation the cursor names', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);
      const cursor = encodeKeysetCursor({
        createdAt: new Date('2026-10-18T09:00:00.000Z'),
        id: 'c2',
      });

      await query.executePage('prof-1', 'requests', cursor, 2);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            participants: {
              some: {
                profileId: 'prof-1',
                deletedAt: null,
                hasAccepted: false,
              },
            },
            OR: [
              { updatedAt: { lt: new Date('2026-10-18T09:00:00.000Z') } },
              {
                updatedAt: new Date('2026-10-18T09:00:00.000Z'),
                id: { lt: 'c2' },
              },
            ],
          },
        }),
      );
    });

    it('says there is no next page on the last one', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        conv('c1', '2026-10-18T08:00:00.000Z'),
      ]);

      const page = await query.executePage('prof-1', 'inbox', undefined, 2);

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });

    it('starts from the top when the cursor cannot be read', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      await query.executePage('prof-1', 'inbox', 'not-a-cursor');

      const args = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(args.where).not.toHaveProperty('OR');
      expect(args.take).toBe(CONVERSATION_PAGE_DEFAULT + 1);
    });

    it('never reads more than the largest page', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      await query.executePage('prof-1', 'inbox', undefined, 1000);

      expect(mockPrisma.conversation.findMany.mock.calls[0][0].take).toBe(
        CONVERSATION_PAGE_MAX + 1,
      );
    });
  });
});
