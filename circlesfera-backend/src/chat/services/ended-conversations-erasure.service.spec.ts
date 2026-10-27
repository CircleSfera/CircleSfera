import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EndedConversationsErasureService,
  erasableConversation,
  reportsKeptSince,
} from './ended-conversations-erasure.service.js';

interface Files {
  url?: string | null;
  standardUrl?: string | null;
  thumbnailUrl?: string | null;
}

interface FakeMessage extends Files {
  id?: string;
  voiceUrl?: string | null;
  media?: Files | null;
  voiceMedia?: Files | null;
  isLocked?: boolean;
  unlocked?: boolean;
  reports?: Array<{ status: string; resolvedAt: Date | null }>;
}

interface FakeConversation {
  id: string;
  avatarUrl?: string | null;
  // One entry per row of the conversation: null while its Profile has it,
  // a date once they removed it.
  rows: Array<Date | null>;
  messages?: FakeMessage[];
}

const now = new Date('2026-11-30T02:00:00Z');
const removed = new Date('2026-10-01T00:00:00Z');
const keptSince = new Date('2026-05-30T02:00:00Z');

// What the condition of erasableConversation says, for one conversation
// held in memory. The SQL itself is checked against PostgreSQL, not here.
function mayBeErased(c: FakeConversation, since: Date): boolean {
  const messages = c.messages ?? [];
  return (
    c.rows.every((deletedAt) => deletedAt !== null) &&
    !messages.some((m) => m.isLocked || m.unlocked) &&
    !messages.some((m) =>
      (m.reports ?? []).some(
        (r) =>
          r.status === 'PENDING' ||
          r.status === 'REVIEWING' ||
          r.resolvedAt === null ||
          r.resolvedAt > since,
      ),
    )
  );
}

// The values a query was given, the nested parts of it included.
function valuesOf(values: unknown[]): unknown[] {
  return values.flatMap((value) =>
    value !== null &&
    typeof value === 'object' &&
    'strings' in value &&
    'values' in value
      ? (value.values as unknown[])
      : [value],
  );
}

// A database holding conversations, answering the queries the erasure makes.
function fakeDatabase(conversations: FakeConversation[]) {
  const live = new Map(conversations.map((c) => [c.id, c]));
  for (const c of conversations) {
    (c.messages ?? []).forEach((m, i) => {
      m.id ??= `${c.id}-m-${String(i).padStart(5, '0')}`;
    });
  }
  const makeClient = () => ({
    conversation: {
      findUnique: vi.fn(async (args: { where: { id: string } }) => {
        const c = live.get(args.where.id);
        return c ? { avatarUrl: c.avatarUrl ?? null } : null;
      }),
      delete: vi.fn(async (args: { where: { id: string } }) => {
        live.delete(args.where.id);
        return { id: args.where.id };
      }),
    },
    message: {
      findMany: vi.fn(
        async (args: {
          where: { conversationId: string; id?: { gt: string } };
          take: number;
        }) =>
          (live.get(args.where.conversationId)?.messages ?? [])
            .filter(
              (m) => !args.where.id || (m.id as string) > args.where.id.gt,
            )
            .sort((a, b) => (a.id as string).localeCompare(b.id as string))
            .slice(0, args.take)
            .map(
              ({ isLocked: _l, unlocked: _u, reports: _r, ...files }) => files,
            ),
      ),
    },
    $queryRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        const args = valuesOf(values);
        if (sql.includes('FOR UPDATE')) {
          const id = args[0] as string;
          return live.has(id) ? [{ id }] : [];
        }
        const since = args.find((v): v is Date => v instanceof Date);
        expect(since).toEqual(keptSince);
        if (sql.includes('LIMIT')) {
          const after = args.find((v): v is string => typeof v === 'string');
          const take = args.find((v): v is number => typeof v === 'number');
          return [...live.values()]
            .filter((c) => after === undefined || c.id > after)
            .filter((c) => mayBeErased(c, keptSince))
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, take)
            .map((c) => ({ id: c.id }));
        }
        const id = args[0] as string;
        const c = live.get(id);
        return c && mayBeErased(c, keptSince) ? [{ id }] : [];
      },
    ),
  });
  // The transaction is a client of its own, as Prisma's is: what is done in
  // it is undone when it fails.
  const tx = makeClient();
  const prisma = {
    ...makeClient(),
    $transaction: vi.fn(
      async (
        fn: (client: typeof tx) => Promise<unknown>,
        _options: unknown,
      ) => {
        const before = new Map(live);
        try {
          return await fn(tx);
        } catch (error) {
          live.clear();
          for (const [id, c] of before) live.set(id, c);
          throw error;
        }
      },
    ),
  };
  return { prisma, tx, live };
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

  it('keeps reports for as long as a decision can be appealed', () => {
    expect(reportsKeptSince(now)).toEqual(keptSince);
    expect(erasableConversation(now).values).toEqual([keptSince]);
  });

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

      await expect(service.eraseEnded(now)).resolves.toBe(ended ? 1 : 0);

      expect(live.has('c-1')).toBe(!ended);
    });
  });

  describe('what keeps a chat everybody left', () => {
    const resolved = (status: string, resolvedAt: Date | null) => ({
      status,
      resolvedAt,
    });

    it.each<[string, FakeMessage, boolean]>([
      ['a paid message', { isLocked: true }, false],
      ['a message someone paid to unlock', { unlocked: true }, false],
      [
        'a message reported and not reviewed yet',
        { reports: [resolved('PENDING', null)] },
        false,
      ],
      [
        'a message whose report is being reviewed',
        { reports: [resolved('REVIEWING', null)] },
        false,
      ],
      [
        'a message whose report was resolved within the appeal window',
        { reports: [resolved('RESOLVED', new Date('2026-07-01T00:00:00Z'))] },
        false,
      ],
      [
        'a message whose report was resolved with no date',
        { reports: [resolved('RESOLVED', null)] },
        false,
      ],
      [
        'nothing, once the report was rejected before the appeal window',
        { reports: [resolved('REJECTED', new Date('2026-04-01T00:00:00Z'))] },
        true,
      ],
      ['nothing, for a message nobody paid for nor reported', {}, true],
    ])('%s: erased %s', async (_name, message, erased) => {
      const { service, live } = serviceOver([
        { id: 'c-1', rows: [removed, removed], messages: [message] },
      ]);

      await expect(service.eraseEnded(now)).resolves.toBe(erased ? 1 : 0);

      expect(live.has('c-1')).toBe(!erased);
    });

    it('reads it again once held, so a chat reported since the page was read is kept', async () => {
      const message: FakeMessage = {};
      const { service, tx, live } = serviceOver([
        { id: 'c-1', rows: [removed], messages: [message] },
      ]);
      const lock = tx.$queryRaw.getMockImplementation();
      tx.$queryRaw.mockImplementation(async (strings, ...values) => {
        if (strings.join('?').includes('FOR UPDATE')) {
          message.reports = [{ status: 'PENDING', resolvedAt: null }];
        }
        return lock?.(strings, ...values) ?? [];
      });

      await expect(service.eraseEnded(now)).resolves.toBe(0);

      expect(live.has('c-1')).toBe(true);
      expect(tx.conversation.delete).not.toHaveBeenCalled();
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

    await expect(service.eraseEnded(now)).resolves.toBe(103);

    expect(live.size).toBe(102);
    expect([...live.values()].every((c) => c.rows.includes(null))).toBe(true);
    const pages = prisma.$queryRaw.mock.calls
      .filter(([strings]) => strings.join('?').includes('LIMIT'))
      .map(
        ([, ...values]) =>
          valuesOf(values).find((v) => typeof v === 'string') ?? null,
      );
    expect(pages).toEqual([null, 'c-198', 'c-204']);
  });

  it('reads the files of a long chat a page of messages at a time', async () => {
    const messages: FakeMessage[] = Array.from({ length: 2500 }, (_, i) => ({
      url: `/uploads/${i}.jpg`,
    }));
    const { service, tx } = serviceOver([{ id: 'c-1', rows: [], messages }]);

    await expect(service.eraseEnded(now)).resolves.toBe(1);

    const reads = tx.message.findMany.mock.calls.map(([args]) => args);
    expect(reads.map((args) => args.where.id?.gt ?? null)).toEqual([
      null,
      'c-1-m-00999',
      'c-1-m-01999',
    ]);
    expect(reads.every((args) => args.take === 1000)).toBe(true);
    const [, files] = storedFiles.release.mock.calls[0];
    expect(files.filter(Boolean)).toHaveLength(2500);
  });

  it('collects every file of the messages and the group picture, then sets them aside', async () => {
    const { service, prisma, tx } = serviceOver([
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

    await expect(service.eraseEnded(now)).resolves.toBe(1);

    expect(tx.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c-1' },
      orderBy: { id: 'asc' },
      take: 1000,
      select: {
        id: true,
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
    const [owner, files, client] = storedFiles.release.mock.calls[0];
    expect(owner).toBe('');
    // In the transaction that erases the conversation, not after it.
    expect(client).toBe(tx);
    expect(client).not.toBe(prisma);
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
    expect(tx.conversation.delete.mock.invocationCallOrder[0]).toBeLessThan(
      storedFiles.release.mock.invocationCallOrder[0],
    );
  });

  it('holds the row first and reads again who is in it, so a chat written in since is kept', async () => {
    const { service, tx, live } = serviceOver([
      { id: 'c-1', rows: [removed, removed] },
    ]);
    // Someone writes to the chat between the page being read and the row
    // being held: both sides have it again.
    const answer = tx.$queryRaw.getMockImplementation();
    tx.$queryRaw.mockImplementation(async (strings, ...values) => {
      if (strings.join('?').includes('FOR UPDATE')) {
        const c = live.get('c-1');
        if (c) c.rows = [null, null];
      }
      return answer?.(strings, ...values) ?? [];
    });

    await expect(service.eraseEnded(now)).resolves.toBe(0);

    expect(live.has('c-1')).toBe(true);
    expect(tx.conversation.delete).not.toHaveBeenCalled();
    expect(storedFiles.release).not.toHaveBeenCalled();
  });

  it('leaves a conversation another server erased first', async () => {
    const { service, tx, live } = serviceOver([{ id: 'c-1', rows: [] }]);
    const answer = tx.$queryRaw.getMockImplementation();
    tx.$queryRaw.mockImplementation(async (strings, ...values) => {
      if (strings.join('?').includes('FOR UPDATE')) live.delete('c-1');
      return answer?.(strings, ...values) ?? [];
    });

    await expect(service.eraseEnded(now)).resolves.toBe(0);

    expect(tx.message.findMany).not.toHaveBeenCalled();
    expect(tx.conversation.delete).not.toHaveBeenCalled();
    expect(storedFiles.release).not.toHaveBeenCalled();
  });

  it('goes on with the next conversation when one cannot be erased', async () => {
    const { service, tx, live } = serviceOver([
      { id: 'c-1', rows: [] },
      { id: 'c-2', rows: [] },
    ]);
    tx.conversation.delete.mockRejectedValueOnce(new Error('deadlock'));

    await expect(service.eraseEnded(now)).resolves.toBe(1);

    expect(live.has('c-1')).toBe(true);
    expect(live.has('c-2')).toBe(false);
  });

  it('says what went wrong when an error is not an Error', async () => {
    const { service, tx } = serviceOver([{ id: 'c-1', rows: [] }]);
    tx.conversation.delete.mockRejectedValueOnce('lost');
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await expect(service.eraseEnded(now)).resolves.toBe(0);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('lost'));
  });

  it('keeps the conversation when its files cannot be set aside, for the next night', async () => {
    const { service, live } = serviceOver([
      { id: 'c-1', rows: [] },
      { id: 'c-2', rows: [] },
    ]);
    storedFiles.release.mockRejectedValueOnce(new Error('database away'));
    const warn = vi.spyOn(
      (service as unknown as { logger: { warn: (m: string) => void } }).logger,
      'warn',
    );

    await expect(service.eraseEnded(now)).resolves.toBe(1);

    expect(live.has('c-1')).toBe(true);
    expect(live.has('c-2')).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('database away'));
  });

  it.each([
    ['an Error', new Error('database away'), 'database away'],
    ['anything else', 'database away', 'database away'],
  ])(
    'never throws out of the night run when reading a page fails with %s',
    async (_name, failure, said) => {
      const { service, prisma } = serviceOver([]);
      prisma.$queryRaw.mockRejectedValueOnce(failure);
      const error = vi.spyOn(
        (service as unknown as { logger: { error: (m: string) => void } })
          .logger,
        'error',
      );

      await expect(service.eraseEnded(now)).resolves.toBe(0);

      expect(error).toHaveBeenCalledWith(expect.stringContaining(said));
    },
  );

  it('sets aside no picture when the conversation row answers none', async () => {
    const { service, tx } = serviceOver([{ id: 'c-1', rows: [] }]);
    tx.conversation.findUnique.mockResolvedValueOnce(null);

    await expect(service.eraseEnded(now)).resolves.toBe(1);

    expect(storedFiles.release).toHaveBeenCalledWith('', [undefined], tx);
  });

  it('runs at the current time when none is given', async () => {
    vi.useFakeTimers({ now });
    try {
      const { service, live } = serviceOver([{ id: 'c-1', rows: [] }]);

      await expect(service.eraseEnded()).resolves.toBe(1);
      await expect(service.erase('c-gone')).resolves.toBe(false);

      expect(live.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
