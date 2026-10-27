import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ENDED_CONVERSATION,
  EndedConversationsErasureService,
} from './ended-conversations-erasure.service.js';

interface Files {
  url?: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
}

interface FakeMessage extends Files {
  voiceUrl?: string | null;
  media?: Files | null;
  voiceMedia?: Files | null;
}

interface FakeConversation {
  id: string;
  avatarUrl?: string | null;
  // One entry per row of the conversation: null while its Profile has it,
  // a date once they removed it.
  rows: Array<Date | null>;
  messages?: FakeMessage[];
}

const removed = new Date('2026-10-01T00:00:00Z');

// A database holding conversations, answering the queries the erasure makes
// the way PostgreSQL would for these filters.
function fakeDatabase(conversations: FakeConversation[]) {
  const live = new Map(conversations.map((c) => [c.id, c]));
  const hasEnded = (c: FakeConversation, where: typeof ENDED_CONVERSATION) => {
    expect(where.participants).toEqual({ none: { deletedAt: null } });
    return c.rows.every((deletedAt) => deletedAt !== null);
  };
  const client = {
    conversation: {
      findMany: vi.fn(
        async (args: {
          where: typeof ENDED_CONVERSATION & { id?: { gt: string } };
          take: number;
        }) =>
          [...live.values()]
            .filter((c) => hasEnded(c, args.where))
            .filter((c) => !args.where.id || c.id > args.where.id.gt)
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, args.take)
            .map((c) => ({ id: c.id })),
      ),
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const c = live.get(args.where.id);
        return c ? { avatarUrl: c.avatarUrl ?? null } : null;
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        live.delete(args.where.id);
        return { id: args.where.id };
      }),
    },
    participant: {
      count: vi.fn(
        async (args: {
          where: { conversationId: string; deletedAt: null };
        }) => {
          expect(args.where.deletedAt).toBeNull();
          return (
            live
              .get(args.where.conversationId)
              ?.rows.filter((deletedAt) => deletedAt === null).length ?? 0
          );
        },
      ),
    },
    message: {
      findMany: vi.fn(
        async (args: { where: { conversationId: string } }) =>
          live.get(args.where.conversationId)?.messages ?? [],
      ),
    },
    $queryRaw: vi.fn(
      async (_sql: TemplateStringsArray, conversationId: string) =>
        live.has(conversationId) ? [{ id: conversationId }] : [],
    ),
  };
  const prisma = {
    ...client,
    $transaction: vi.fn(
      async (fn: (tx: typeof client) => Promise<unknown>, _options: unknown) =>
        fn(client),
    ),
  };
  return { prisma, live };
}

describe('EndedConversationsErasureService', () => {
  let storedFiles: { release: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    storedFiles = { release: vi.fn().mockResolvedValue([]) };
  });

  function serviceOver(conversations: FakeConversation[]) {
    const db = fakeDatabase(conversations);
    const service = new EndedConversationsErasureService(
      db.prisma as never,
      storedFiles as never,
    );
    return { service, ...db };
  }

  describe('which conversations have ended', () => {
    it.each<[string, Array<Date | null>, boolean]>([
      ['a group whose last member left', [], true],
      ['a group with a member still in it', [null], false],
      ['a group with only a pending invitation left', [null], false],
      ['a group every invitee of which declined', [removed, removed], true],
      ['a one-to-one chat both sides removed', [removed, removed], true],
      ['a one-to-one chat one side still has', [removed, null], false],
      ['a one-to-one chat neither side removed', [null, null], false],
      [
        'a one-to-one chat whose other side was erased, removed by this one',
        [removed],
        true,
      ],
      [
        'a one-to-one chat whose other side was erased, kept by this one',
        [null],
        false,
      ],
    ])('%s: erased %s', async (_name, rows, ended) => {
      const { service, live } = serviceOver([{ id: 'c-1', rows }]);

      await expect(service.eraseEnded()).resolves.toBe(ended ? 1 : 0);

      expect(live.has('c-1')).toBe(!ended);
    });
  });

  it('erases page after page, in the order of their ids, and keeps the rest', async () => {
    const conversations: FakeConversation[] = Array.from(
      { length: 205 },
      (_, i) => ({
        id: `c-${String(i).padStart(3, '0')}`,
        rows: i % 2 === 0 ? [removed] : [removed, null],
      }),
    );
    const { service, prisma, live } = serviceOver(conversations);

    await expect(service.eraseEnded()).resolves.toBe(103);

    expect(live.size).toBe(102);
    expect([...live.values()].every((c) => c.rows.includes(null))).toBe(true);
    const pages = prisma.conversation.findMany.mock.calls.map(
      ([args]) => args.where.id?.gt ?? null,
    );
    expect(pages).toEqual([null, 'c-198', 'c-204']);
    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' }, take: 100 }),
    );
  });

  it('collects every file of the messages and the group picture, then sets them aside', async () => {
    const { service, prisma } = serviceOver([
      {
        id: 'c-1',
        avatarUrl: '/uploads/group.jpg',
        rows: [],
        messages: [
          {
            url: '/uploads/a.mp4',
            standardUrl: '/uploads/a/master.m3u8',
            thumbnailUrl: '/uploads/a.jpg',
            voiceUrl: null,
            media: {
              url: '/uploads/a.mp4',
              standardUrl: null,
              thumbnailUrl: '/uploads/a-media.jpg',
            },
            voiceMedia: null,
          },
          {
            url: null,
            standardUrl: null,
            thumbnailUrl: null,
            voiceUrl: '/uploads/v.m4a',
            media: null,
            voiceMedia: {
              url: '/uploads/v-media.m4a',
              standardUrl: null,
              thumbnailUrl: null,
            },
          },
        ],
      },
    ]);

    await expect(service.eraseEnded()).resolves.toBe(1);

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c-1' },
      select: {
        url: true,
        standardUrl: true,
        thumbnailUrl: true,
        voiceUrl: true,
        media: {
          select: { url: true, standardUrl: true, thumbnailUrl: true },
        },
        voiceMedia: {
          select: { url: true, standardUrl: true, thumbnailUrl: true },
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 30_000,
      maxWait: 5_000,
    });
    expect(storedFiles.release).toHaveBeenCalledTimes(1);
    const [owner, files] = storedFiles.release.mock.calls[0];
    expect(owner).toBe('');
    expect(files.filter(Boolean).sort()).toEqual(
      [
        '/uploads/group.jpg',
        '/uploads/a.mp4',
        '/uploads/a/master.m3u8',
        '/uploads/a.jpg',
        '/uploads/a.mp4',
        '/uploads/a-media.jpg',
        '/uploads/v.m4a',
        '/uploads/v-media.m4a',
      ].sort(),
    );
    // The files are set aside only once the conversation is gone.
    expect(prisma.conversation.delete.mock.invocationCallOrder[0]).toBeLessThan(
      storedFiles.release.mock.invocationCallOrder[0],
    );
  });

  it('holds the row first and reads again who is in it, so a chat written in since is kept', async () => {
    const { service, prisma, live } = serviceOver([
      { id: 'c-1', rows: [removed, removed] },
    ]);
    // Someone writes to the chat between the page being read and the row
    // being held: both sides have it again.
    prisma.$queryRaw.mockImplementationOnce(async () => {
      const c = live.get('c-1');
      if (c) c.rows = [null, null];
      return [{ id: 'c-1' }];
    });

    await expect(service.eraseEnded()).resolves.toBe(0);

    expect(live.has('c-1')).toBe(true);
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.participant.count.mock.invocationCallOrder[0],
    );
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
    expect(storedFiles.release).not.toHaveBeenCalled();
  });

  it('leaves a conversation another server erased first', async () => {
    const { service, prisma, live } = serviceOver([{ id: 'c-1', rows: [] }]);
    prisma.$queryRaw.mockImplementationOnce(async () => {
      live.delete('c-1');
      return [];
    });

    await expect(service.eraseEnded()).resolves.toBe(0);

    expect(prisma.participant.count).not.toHaveBeenCalled();
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
    expect(storedFiles.release).not.toHaveBeenCalled();
  });

  it('goes on with the next conversation when one cannot be erased', async () => {
    const { service, prisma, live } = serviceOver([
      { id: 'c-1', rows: [] },
      { id: 'c-2', rows: [] },
    ]);
    prisma.conversation.delete.mockRejectedValueOnce(new Error('deadlock'));

    await expect(service.eraseEnded()).resolves.toBe(1);

    expect(live.has('c-1')).toBe(true);
    expect(live.has('c-2')).toBe(false);
  });

  it('says what went wrong when an error is not an Error', async () => {
    const { service, prisma } = serviceOver([{ id: 'c-1', rows: [] }]);
    prisma.conversation.delete.mockRejectedValueOnce('lost');
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await expect(service.eraseEnded()).resolves.toBe(0);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lost'));
  });

  it('counts a conversation erased even when its files could not be set aside', async () => {
    const { service, live } = serviceOver([{ id: 'c-1', rows: [] }]);
    storedFiles.release.mockRejectedValueOnce(new Error('database away'));

    await expect(service.eraseEnded()).resolves.toBe(1);

    expect(live.has('c-1')).toBe(false);
  });

  it('logs a non-Error failure to set the files aside', async () => {
    const { service } = serviceOver([{ id: 'c-1', rows: [] }]);
    storedFiles.release.mockRejectedValueOnce('storage away');
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await expect(service.eraseEnded()).resolves.toBe(1);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('storage away'));
  });

  it.each([
    ['an Error', new Error('database away'), 'database away'],
    ['anything else', 'database away', 'database away'],
  ])(
    'never throws out of the night run when reading a page fails with %s',
    async (_name, failure, said) => {
      const { service, prisma } = serviceOver([]);
      prisma.conversation.findMany.mockRejectedValueOnce(failure);
      const error = vi.spyOn(
        (service as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      );

      await expect(service.eraseEnded()).resolves.toBe(0);

      expect(error).toHaveBeenCalledWith(expect.stringContaining(said));
    },
  );

  it('sets aside no picture when the conversation row answers none', async () => {
    const { service, prisma } = serviceOver([{ id: 'c-1', rows: [] }]);
    prisma.conversation.findUnique.mockResolvedValueOnce(null);

    await expect(service.eraseEnded()).resolves.toBe(1);

    expect(storedFiles.release).toHaveBeenCalledWith('', [undefined]);
  });
});
