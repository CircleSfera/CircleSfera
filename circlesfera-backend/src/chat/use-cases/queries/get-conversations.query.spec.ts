import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
} from '../../../common/pagination/keyset.util.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import {
  AUTHOR_ID,
  BUYER_ID,
  expectClosed,
  expectWhole,
  inlinePaidMedia,
  paidPost,
  realPaywall,
  STRANGER_ID,
} from '../../../common/testing/paid-posts.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import {
  CONVERSATION_PAGE_DEFAULT,
  CONVERSATION_PAGE_MAX,
  GetConversationsQuery,
} from './get-conversations.query.js';

// The conversations each folder of prof-1 lists. A one-to-one chat with a
// Profile prof-1 restricts is in its requests, accepted or not.
const mine = (where: object) => ({
  participants: { some: { profileId: 'prof-1', deletedAt: null, ...where } },
});
const RESTRICTED_CHAT = {
  isGroup: false,
  participants: {
    some: {
      profileId: { not: 'prof-1' },
      profile: { restrictedBy: { some: { restricterId: 'prof-1' } } },
    },
  },
};
const INBOX = { ...mine({ hasAccepted: true }), NOT: RESTRICTED_CHAT };
const REQUESTS = {
  OR: [
    mine({ hasAccepted: false, requestHiddenByWords: false }),
    { AND: [mine({ hasAccepted: true }), RESTRICTED_CHAT] },
  ],
};
const HIDDEN_REQUESTS = mine({
  hasAccepted: false,
  requestHiddenByWords: true,
});

describe('GetConversationsQuery', () => {
  let query: GetConversationsQuery;
  let mockPrisma: {
    conversation: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst?: ReturnType<typeof vi.fn>;
    };
    block: { findMany: ReturnType<typeof vi.fn> };
    restriction: { findMany: ReturnType<typeof vi.fn> };
  };
  let mockCryptoService: {
    decrypt: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findMany: vi.fn(),
      },
      block: { findMany: vi.fn().mockResolvedValue([]) },
      restriction: { findMany: vi.fn().mockResolvedValue([]) },
    };
    mockCryptoService = {
      decrypt: vi.fn((c: string) => `decrypted_${c}`),
    };
    query = new GetConversationsQuery(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
      realPaywall(),
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
      where: INBOX,
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

  it('shows no file of a deleted last message in the preview', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            content: '',
            isDeleted: true,
            url: null,
            standardUrl: '/uploads/v/master.m3u8',
            thumbnailUrl: '/uploads/v/thumb.jpg',
            mediaType: 'video',
            voiceUrl: '/uploads/voice.webm',
          },
        ],
      },
    ]);

    const result = await query.execute('prof-1');

    expect(result[0].messages[0]).toMatchObject({
      standardUrl: null,
      thumbnailUrl: null,
      mediaType: null,
      voiceUrl: null,
    });
  });

  it('shows the latest message without a shared post that moderation removed', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            content: null,
            post: { id: 'post-1', moderationStatus: 'REMOVED' },
          },
        ],
      },
      {
        id: 'conv-2',
        messages: [
          {
            id: 'msg-2',
            content: null,
            post: { id: 'post-2', moderationStatus: 'VISIBLE' },
          },
        ],
      },
      {
        id: 'conv-3',
        messages: [
          {
            id: 'msg-3',
            content: null,
            post: {
              id: 'post-3',
              moderationStatus: 'VISIBLE',
              deletedAt: new Date(),
            },
          },
        ],
      },
    ]);

    const result = await query.execute('prof-1');

    // Nor one its author deleted.
    expect(result[2].messages[0].post).toBeNull();

    expect(result[0].messages[0]).toEqual({
      id: 'msg-1',
      content: null,
      post: null,
    });
    expect(result[1].messages[0].post).toEqual({
      id: 'post-2',
      moderationStatus: 'VISIBLE',
    });
  });

  it('keeps the requests with a hidden word in their own list, out of Requests', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    await query.execute('prof-1', 'hidden_requests');
    await query.executePage('prof-1', 'hidden_requests');

    const [[list], [page]] = mockPrisma.conversation.findMany.mock.calls;
    expect(list.where).toEqual(HIDDEN_REQUESTS);
    expect(page.where.AND).toEqual([HIDDEN_REQUESTS]);
  });

  it('fetches request conversations when folder is requests', async () => {
    mockPrisma.conversation.findMany.mockResolvedValue([]);

    await query.execute('prof-1', 'requests');

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: REQUESTS,
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
        where: { AND: [INBOX] },
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
            AND: [REQUESTS],
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

  describe('across a block', () => {
    const person = (id: string) => ({
      profileId: id,
      profile: { id, username: id, avatar: `/${id}.jpg`, fullName: id },
    });

    it('shows a participant blocked either way as unavailable, the others as they are, with one query for the page', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { id: 'dm', participants: [person('me'), person('bob')], messages: [] },
        {
          id: 'group',
          participants: [person('me'), person('cat'), person('dan')],
          messages: [],
        },
      ]);
      mockPrisma.block.findMany.mockResolvedValue([
        { blockerId: 'me', blockedId: 'bob' },
        { blockerId: 'cat', blockedId: 'me' },
      ]);

      const result = await query.execute('me');

      expect(mockPrisma.block.findMany).toHaveBeenCalledTimes(1);
      const [dm, group] = result as any[];
      expect(dm.participants[1].profile).toEqual({
        id: 'bob',
        username: null,
        avatar: null,
        fullName: null,
        unavailable: true,
      });
      expect(dm.participants[0].profile.username).toBe('me');
      expect(group.participants[1].profile.unavailable).toBe(true);
      expect(group.participants[2].profile).toEqual(person('dan').profile);
    });

    it('shows no read receipt of a participant who restricts the viewer', async () => {
      const read = new Date('2026-11-01T10:00:00.000Z');
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'dm',
          participants: [
            { ...person('me'), lastReadAt: read },
            { ...person('bob'), lastReadAt: read },
            { ...person('cat'), lastReadAt: read },
          ],
          messages: [],
        },
      ]);
      mockPrisma.restriction.findMany.mockResolvedValue([
        { restricterId: 'bob' },
      ]);

      const [dm] = (await query.execute('me')) as any[];

      expect(mockPrisma.restriction.findMany).toHaveBeenCalledWith({
        where: { restrictedId: 'me', restricterId: { in: ['bob', 'cat'] } },
        select: { restricterId: true },
      });
      expect(dm.participants.map((p: any) => p.lastReadAt)).toEqual([
        read,
        null,
        read,
      ]);
      // Nothing else of them changes: they are not shown as unavailable.
      expect(dm.participants[1].profile).toEqual(person('bob').profile);
    });

    it('does the same for a page of the list and for one conversation', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'dm',
          updatedAt: new Date(),
          participants: [person('me'), person('bob')],
          messages: [],
        },
      ]);
      mockPrisma.block.findMany.mockResolvedValue([
        { blockerId: 'bob', blockedId: 'me' },
      ]);
      const page = await query.executePage('me', 'inbox');
      expect((page.items[0] as any).participants[1].profile.unavailable).toBe(
        true,
      );

      (mockPrisma.conversation as any).findFirst = vi.fn().mockResolvedValue({
        id: 'dm',
        participants: [person('me'), person('bob')],
        messages: [],
      });
      const one = (await query.executeOne('dm', 'me')) as any;
      expect(one.participants[1].profile.username).toBeNull();
    });

    it('one conversation the viewer is not in is not found', async () => {
      (mockPrisma.conversation as any).findFirst = vi
        .fn()
        .mockResolvedValue(null);
      await expect(query.executeOne('dm', 'me')).rejects.toThrow(
        'Conversation not found',
      );
    });
  });

  describe('a paid post the latest message shares', () => {
    const conversation = () => ({
      id: 'dm',
      updatedAt: new Date(),
      participants: [],
      messages: [
        {
          id: 'm1',
          content: null,
          post: paidPost([inlinePaidMedia()], {
            moderationStatus: 'VISIBLE',
            deletedAt: null,
            archivedAt: null,
          }),
        },
      ],
    });

    const lists = {
      list: async (viewer: string) =>
        ((await query.execute(viewer)) as any[])[0],
      page: async (viewer: string) =>
        ((await query.executePage(viewer, 'inbox')).items as any[])[0],
      one: async (viewer: string) => query.executeOne('dm', viewer) as any,
    };

    const previewFor = async (list: keyof typeof lists, viewer: string) => {
      mockPrisma.conversation.findMany.mockResolvedValue([conversation()]);
      (mockPrisma.conversation as any).findFirst = vi
        .fn()
        .mockResolvedValue(conversation());
      return (await lists[list](viewer)).messages[0].post;
    };

    for (const list of Object.keys(lists) as Array<keyof typeof lists>) {
      it(`${list}: is closed to a viewer who has not unlocked it`, async () => {
        expectClosed(await previewFor(list, STRANGER_ID));
      });

      it(`${list}: is whole for its author and for a viewer who unlocked it`, async () => {
        expectWhole(await previewFor(list, AUTHOR_ID));
        expectWhole(await previewFor(list, BUYER_ID));
      });
    }
  });
});
