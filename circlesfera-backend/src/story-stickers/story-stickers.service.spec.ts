import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateTargetUrl } from '../common/utils/ssrf.util.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStoryStickerDto } from './dto/story-sticker.dto.js';
import { StoryStickersService } from './story-stickers.service.js';

vi.mock('../common/utils/ssrf.util.js', () => ({
  validateTargetUrl: vi.fn(async (url: string) => new URL(url)),
}));

const AUTHOR = 'author';
const VIEWER = 'viewer';
const later = new Date(Date.now() + 3_600_000);

function prismaMock() {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    follow: { findUnique: vi.fn() },
    closeFriend: { findUnique: vi.fn() },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ id: 'mentioned' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    story: {
      findUnique: vi.fn().mockResolvedValue({
        profileId: AUTHOR,
        expiresAt: later,
        isCloseFriendsOnly: false,
        profile: { privacyLevel: 'PUBLIC' },
      }),
    },
    storySticker: {
      findUnique: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(0),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    blockedLinkDomain: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    storyStickerResponse: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
  };
}

const place = { x: 0.1, y: -0.2, scale: 1, rotation: 0 };
const sticker = (over: Partial<CreateStoryStickerDto>) =>
  ({ ...place, ...over }) as CreateStoryStickerDto;

describe('StoryStickersService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: StoryStickersService;
  let emitter: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = prismaMock();
    emitter = { emit: vi.fn() };
    service = new StoryStickersService(
      prisma as unknown as PrismaService,
      emitter as never,
    );
  });

  const holds = (kind: string, settings: object) =>
    prisma.storySticker.findUnique.mockResolvedValue({
      id: 'st-1',
      storyId: 'story-1',
      kind,
      settings,
    });

  describe('creating the stickers of a new story', () => {
    it('saves each with what it holds, trimmed, and where it sits', async () => {
      await service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        [
          sticker({
            kind: 'POLL',
            settings: { question: ' ¿Playa? ', options: ['Sí', 'No'] },
          }),
          sticker({ kind: 'HASHTAG', settings: { tag: '#verano' }, scale: 3 }),
        ],
        null,
      );

      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          {
            storyId: 'story-1',
            kind: 'POLL',
            settings: { question: '¿Playa?', options: ['Sí', 'No'] },
            ...place,
          },
          {
            storyId: 'story-1',
            kind: 'HASHTAG',
            settings: { tag: 'verano' },
            ...place,
            scale: 3,
          },
        ],
      });
    });

    it('does nothing for a story without stickers', async () => {
      await expect(
        service.createForStory(prisma as never, 'story-1', AUTHOR, [], null),
      ).resolves.toEqual([]);
      expect(prisma.storySticker.createMany).not.toHaveBeenCalled();
    });

    it('keeps a poll, a question, a quiz and a slider within the sizes of the editor', async () => {
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [
            sticker({
              kind: 'POLL',
              settings: { question: 'Q', options: ['a', 'b'] },
              scale: 2,
            }),
          ],
          null,
        ),
      ).rejects.toThrow('STICKER_SCALE_OUT_OF_RANGE');
    });

    it('refuses a mention of a profile that does not exist or is blocked', async () => {
      prisma.profile.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [sticker({ kind: 'MENTION', settings: { profileId: 'ghost' } })],
          null,
        ),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');

      prisma.block.findFirst.mockResolvedValueOnce({ id: 'b' });
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [sticker({ kind: 'MENTION', settings: { profileId: 'mentioned' } })],
          null,
        ),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');
    });

    it('returns each profile mentioned once, never the author', async () => {
      prisma.profile.findUnique.mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id }),
      );
      const mentioned = await service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        [
          sticker({ kind: 'MENTION', settings: { profileId: 'ana' } }),
          sticker({ kind: 'MENTION', settings: { profileId: 'ana' } }),
          sticker({ kind: 'MENTION', settings: { profileId: AUTHOR } }),
        ],
        null,
      );
      expect(mentioned).toEqual(['ana']);
    });

    it('gives a location the story’s place, whatever the client sent', async () => {
      await service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        [sticker({ kind: 'LOCATION', settings: { placeId: 'elsewhere' } })],
        'place-1',
      );
      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          {
            storyId: 'story-1',
            kind: 'LOCATION',
            settings: { placeId: 'place-1' },
            ...place,
          },
        ],
      });
    });

    it('refuses a location on a story with no place, and two on one story', async () => {
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [sticker({ kind: 'LOCATION', settings: {} })],
          null,
        ),
      ).rejects.toThrow('PLACE_NOT_FOUND');
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [
            sticker({ kind: 'LOCATION', settings: {} }),
            sticker({ kind: 'LOCATION', settings: {} }),
          ],
          'place-1',
        ),
      ).rejects.toThrow('ONE_LOCATION_STICKER_PER_STORY');
    });

    it('refuses more than ten stickers', async () => {
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          Array.from({ length: 11 }, () =>
            sticker({ kind: 'HASHTAG', settings: { tag: 'a' } }),
          ),
          null,
        ),
      ).rejects.toThrow('TOO_MANY_STICKERS');
    });
  });

  describe('answering a sticker', () => {
    const poll = { question: 'Q', options: ['a', 'b'] };

    it('records a vote once per person, and lets it change', async () => {
      holds('POLL', poll);

      await service.respond(VIEWER, 'st-1', { optionIndex: 1 });

      expect(prisma.storyStickerResponse.upsert).toHaveBeenCalledWith({
        where: { voteKey_profileId: { voteKey: 'st-1', profileId: VIEWER } },
        create: {
          stickerId: 'st-1',
          voteKey: 'st-1',
          profileId: VIEWER,
          optionIndex: 1,
        },
        update: { optionIndex: 1 },
      });
    });

    it('refuses an option the poll does not have', async () => {
      holds('POLL', poll);
      await expect(
        service.respond(VIEWER, 'st-1', { optionIndex: 2 }),
      ).rejects.toThrow('INVALID_POLL_OPTION');
    });

    it('takes a quiz answer once, and keeps the first', async () => {
      holds('QUIZ', { ...poll, correctIndex: 0 });
      prisma.storyStickerResponse.findUnique.mockResolvedValueOnce({ id: 'r' });

      await service.respond(VIEWER, 'st-1', { optionIndex: 1 });

      expect(prisma.storyStickerResponse.create).not.toHaveBeenCalled();
      expect(prisma.storyStickerResponse.upsert).not.toHaveBeenCalled();
    });

    it('records a slider value', async () => {
      holds('SLIDER', { question: '', emoji: '😍' });

      await service.respond(VIEWER, 'st-1', { value: 0.7 });

      expect(prisma.storyStickerResponse.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { value: 0.7 } }),
      );
    });

    it('keeps every answer to a question, outside the one-per-person key', async () => {
      holds('QUESTION', { prompt: 'P' });

      await service.respond(VIEWER, 'st-1', { text: '  Hola  ' });

      expect(prisma.storyStickerResponse.create).toHaveBeenCalledWith({
        data: { stickerId: 'st-1', profileId: VIEWER, text: 'Hola' },
      });
    });

    it('refuses an empty answer, a mention, one’s own story and an ended story', async () => {
      holds('QUESTION', { prompt: 'P' });
      await expect(
        service.respond(VIEWER, 'st-1', { text: ' ' }),
      ).rejects.toThrow('EMPTY_ANSWER_TEXT');

      holds('MENTION', { profileId: 'x' });
      await expect(service.respond(VIEWER, 'st-1', {})).rejects.toThrow(
        'STICKER_NOT_ANSWERABLE',
      );

      holds('POLL', poll);
      await expect(
        service.respond(AUTHOR, 'st-1', { optionIndex: 0 }),
      ).rejects.toThrow('CANNOT_ANSWER_OWN_STICKER');

      prisma.story.findUnique.mockResolvedValueOnce({
        profileId: AUTHOR,
        expiresAt: new Date(Date.now() - 1000),
        isCloseFriendsOnly: false,
        profile: { privacyLevel: 'PUBLIC' },
      });
      await expect(
        service.respond(VIEWER, 'st-1', { optionIndex: 0 }),
      ).rejects.toThrow('STORY_EXPIRED');
    });

    it('is as private as the story: a blocked viewer finds nothing', async () => {
      holds('POLL', poll);
      prisma.block.findFirst.mockResolvedValueOnce({ id: 'b' });
      await expect(
        service.respond(VIEWER, 'st-1', { optionIndex: 0 }),
      ).rejects.toThrow('Story not found');
    });
  });

  describe('what a sticker has gathered', () => {
    it('counts each option and marks the viewer’s vote', async () => {
      holds('POLL', { question: 'Q', options: ['a', 'b'] });
      prisma.storyStickerResponse.findMany.mockResolvedValueOnce([
        { profileId: VIEWER, optionIndex: 1, value: null },
        { profileId: 'x', optionIndex: 1, value: null },
        { profileId: 'y', optionIndex: 0, value: null },
        { profileId: 'z', optionIndex: 1, value: null },
      ]);

      const result = await service.results(VIEWER, 'st-1');

      expect(result).toMatchObject({
        totalResponses: 4,
        myResponse: { optionIndex: 1 },
        options: [
          { index: 0, text: 'a', votes: 1, percentage: 25 },
          { index: 1, text: 'b', votes: 3, percentage: 75 },
        ],
      });
    });

    it('shows the right option of a quiz only after answering', async () => {
      holds('QUIZ', { question: 'Q', options: ['a', 'b'], correctIndex: 1 });

      const before = await service.results(VIEWER, 'st-1');
      expect(before.settings).not.toHaveProperty('correctIndex');

      prisma.storyStickerResponse.findMany.mockResolvedValueOnce([
        { profileId: VIEWER, optionIndex: 0, value: null },
      ]);
      const after = await service.results(VIEWER, 'st-1');
      expect(after.settings).toHaveProperty('correctIndex', 1);
    });

    it('averages a slider', async () => {
      holds('SLIDER', { question: '', emoji: '😍' });
      prisma.storyStickerResponse.findMany.mockResolvedValueOnce([
        { profileId: 'x', optionIndex: null, value: 0.2 },
        { profileId: 'y', optionIndex: null, value: 0.6 },
      ]);

      expect(await service.results(VIEWER, 'st-1')).toMatchObject({
        average: 0.4,
        totalResponses: 2,
      });
    });

    it('gives the answers to a question to its author only', async () => {
      holds('QUESTION', { prompt: 'P' });
      prisma.storyStickerResponse.findMany.mockResolvedValue([
        { id: 'r', text: 'Hola', createdAt: new Date(), profile: { id: 'x' } },
      ]);

      const forViewer = await service.results(VIEWER, 'st-1');
      expect(forViewer).toMatchObject({ answers: [], totalResponses: 0 });

      prisma.storyStickerResponse.count.mockResolvedValueOnce(3);
      const forAuthor = await service.results(AUTHOR, 'st-1');
      // Three answers, one the author may still see.
      expect(forAuthor).toMatchObject({ totalResponses: 3, isAuthor: true });
      expect(forAuthor.answers).toHaveLength(1);
      expect(prisma.storyStickerResponse.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            stickerId: 'st-1',
            profile: expect.objectContaining({
              blocking: { none: { blockedId: AUTHOR } },
              blockedBy: { none: { blockerId: AUTHOR } },
            }),
          }),
          take: 200,
        }),
      );
    });

    it('tells the author, and only the author, who voted what', async () => {
      holds('POLL', { question: 'Q', options: ['a', 'b'] });
      const ana = {
        optionIndex: 1,
        value: null,
        createdAt: new Date(),
        profile: { id: 'p-ana', username: 'ana', fullName: null, avatar: null },
      };
      prisma.storyStickerResponse.findMany
        .mockResolvedValueOnce([
          { profileId: 'p-ana', optionIndex: 1, value: null },
        ])
        .mockResolvedValueOnce([ana]);

      const forAuthor = await service.results(AUTHOR, 'st-1');
      expect(forAuthor).toMatchObject({ responders: [ana], totalResponses: 1 });
      expect(prisma.storyStickerResponse.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            voteKey: 'st-1',
            profile: expect.objectContaining({
              blocking: { none: { blockedId: AUTHOR } },
            }),
          }),
          orderBy: { createdAt: 'desc' },
          take: 200,
        }),
      );

      prisma.storyStickerResponse.findMany.mockResolvedValueOnce([
        { profileId: 'p-ana', optionIndex: 1, value: null },
      ]);
      const forViewer = await service.results(VIEWER, 'st-1');
      expect(forViewer).not.toHaveProperty('responders');
    });
  });

  it('sends a quiz to the feed without its answer, except to its author', () => {
    const rows = [
      {
        id: 'q',
        kind: 'QUIZ' as const,
        settings: { question: 'Q', options: ['a', 'b'], correctIndex: 0 },
        ...place,
      },
    ];
    expect(service.forFeed(rows, false)[0].settings).not.toHaveProperty(
      'correctIndex',
    );
    expect(service.forFeed(rows, true)[0].settings).toHaveProperty(
      'correctIndex',
      0,
    );
  });

  describe('names in the feed', () => {
    const row = (kind: string, settings: object) => ({
      id: `st-${kind}`,
      kind,
      settings,
      ...place,
    });

    it('writes the username of a mention and the name of the place', () => {
      const feed = service.forFeed(
        [
          row('MENTION', { profileId: 'p-ana' }),
          row('LOCATION', { placeId: 'place-1' }),
        ] as never,
        false,
        { usernames: new Map([['p-ana', 'ana']]), placeName: 'Madrid' },
      );
      expect(feed.map((s) => s.settings)).toEqual([
        { profileId: 'p-ana', username: 'ana' },
        { placeId: 'place-1', name: 'Madrid' },
      ]);
    });

    it('leaves out a mention it has no username for, and a place with no name', () => {
      const feed = service.forFeed(
        [
          row('MENTION', { profileId: 'p-gone' }),
          row('LOCATION', { placeId: 'place-1' }),
          row('HASHTAG', { tag: 'verano' }),
        ] as never,
        false,
      );
      expect(feed.map((s) => s.kind)).toEqual(['HASHTAG']);
    });

    it('looks up the profiles mentioned that the viewer may see, once', async () => {
      prisma.profile.findMany.mockResolvedValueOnce([
        { id: 'p-ana', username: 'ana' },
      ]);
      const names = await service.mentionNames(
        [
          { kind: 'MENTION', settings: { profileId: 'p-ana' } },
          { kind: 'MENTION', settings: { profileId: 'p-ana' } },
          { kind: 'MENTION', settings: { profileId: 'p-blocked' } },
          { kind: 'POLL', settings: { question: 'Q' } },
        ] as never,
        VIEWER,
      );
      expect(names).toEqual(new Map([['p-ana', 'ana']]));
      expect(prisma.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['p-ana', 'p-blocked'] },
            blocking: { none: { blockedId: VIEWER } },
            blockedBy: { none: { blockerId: VIEWER } },
          }),
        }),
      );
    });

    it('asks nothing when no sticker mentions anyone', async () => {
      await expect(
        service.mentionNames(
          [{ kind: 'HASHTAG', settings: { tag: 'a' } }] as never,
          VIEWER,
        ),
      ).resolves.toEqual(new Map());
      expect(prisma.profile.findMany).not.toHaveBeenCalled();
    });
  });

  describe('a countdown', () => {
    const inAnHour = () => new Date(Date.now() + 3_600_000).toISOString();

    it('is saved with when it ends, to be told then', async () => {
      const endsAt = inAnHour();
      await service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        [
          sticker({
            kind: 'COUNTDOWN',
            settings: { title: ' Fiesta ', endsAt },
          }),
        ],
        null,
      );

      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          {
            storyId: 'story-1',
            kind: 'COUNTDOWN',
            settings: { title: 'Fiesta', endsAt },
            endsAt: new Date(endsAt),
            ...place,
          },
        ],
      });
    });

    it('takes a reminder from a viewer, and lets it go', async () => {
      holds('COUNTDOWN', { title: 'Fiesta', endsAt: inAnHour() });
      const key = { voteKey: 'st-1', profileId: VIEWER };

      await service.respond(VIEWER, 'st-1', { remind: true });
      expect(prisma.storyStickerResponse.upsert).toHaveBeenCalledWith({
        where: { voteKey_profileId: key },
        create: { stickerId: 'st-1', ...key },
        update: {},
      });

      await service.respond(VIEWER, 'st-1', { remind: false });
      expect(prisma.storyStickerResponse.deleteMany).toHaveBeenCalledWith({
        where: key,
      });
    });

    it('takes no reminder once it has ended, nor without saying which', async () => {
      holds('COUNTDOWN', { title: 'Fiesta', endsAt: inAnHour() });
      await expect(service.respond(VIEWER, 'st-1', {})).rejects.toThrow(
        'REMIND_REQUIRED',
      );

      holds('COUNTDOWN', {
        title: 'Fiesta',
        endsAt: new Date(Date.now() - 1000).toISOString(),
      });
      await expect(
        service.respond(VIEWER, 'st-1', { remind: true }),
      ).rejects.toThrow('COUNTDOWN_ENDED');
      expect(prisma.storyStickerResponse.upsert).not.toHaveBeenCalled();
    });

    describe('when it ends', () => {
      const now = new Date('2026-10-20T20:00:00Z');
      const ended = (expiresAt: Date) => ({
        id: 'st-1',
        settings: { title: 'Fiesta', endsAt: now.toISOString() },
        story: { id: 'story-1', profileId: AUTHOR, expiresAt },
      });

      it('tells each person who asked, and the author, once, linking the story while it lasts', async () => {
        prisma.storySticker.findMany.mockResolvedValue([
          ended(new Date(now.getTime() + 60_000)),
        ]);
        prisma.storyStickerResponse.findMany.mockResolvedValue([
          { profileId: 'ana' },
          { profileId: 'luis' },
        ]);

        await expect(service.announceEndedCountdowns(now)).resolves.toBe(3);

        expect(prisma.storySticker.findMany.mock.calls[0][0].where).toEqual({
          kind: 'COUNTDOWN',
          endsAt: { lte: now },
          announcedAt: null,
          story: { deletedAt: null },
        });
        expect(prisma.storySticker.updateMany).toHaveBeenCalledWith({
          where: { id: 'st-1', announcedAt: null },
          data: { announcedAt: now },
        });
        const told = emitter.emit.mock.calls.map(([, p]) => p.recipientId);
        expect(told).toEqual(['ana', 'luis', AUTHOR]);
        expect(emitter.emit.mock.calls[0]).toEqual([
          'notification.create',
          {
            recipientId: 'ana',
            senderId: AUTHOR,
            type: 'SYSTEM',
            notice: { key: 'countdown_ended', title: 'Fiesta' },
            targetType: 'story',
            targetId: 'story-1',
          },
        ]);
      });

      it('links nothing once the story is gone from view', async () => {
        prisma.storySticker.findMany.mockResolvedValue([
          ended(new Date(now.getTime() - 60_000)),
        ]);

        await service.announceEndedCountdowns(now);

        expect(emitter.emit.mock.calls[0][1]).not.toHaveProperty('targetType');
      });

      it('lets a countdown go for the next run when who asked cannot be read, and tells the others', async () => {
        prisma.storySticker.findMany.mockResolvedValue([
          ended(new Date(now.getTime() + 60_000)),
          { ...ended(new Date(now.getTime() + 60_000)), id: 'st-2' },
        ]);
        prisma.storyStickerResponse.findMany
          .mockRejectedValueOnce(new Error('db down'))
          .mockResolvedValueOnce([{ profileId: 'ana' }]);
        prisma.storySticker.updateMany
          .mockResolvedValueOnce({ count: 1 })
          .mockRejectedValueOnce(new Error('db down'))
          .mockResolvedValueOnce({ count: 1 });

        await expect(service.announceEndedCountdowns(now)).resolves.toBe(2);

        expect(prisma.storySticker.updateMany).toHaveBeenNthCalledWith(2, {
          where: { id: 'st-1', announcedAt: now },
          data: { announcedAt: null },
        });
        const told = emitter.emit.mock.calls.map(([, p]) => p.recipientId);
        expect(told).toEqual(['ana', AUTHOR]);
      });

      it('tells nobody when another server has already taken it', async () => {
        prisma.storySticker.findMany.mockResolvedValue([
          ended(new Date(now.getTime() + 60_000)),
        ]);
        prisma.storySticker.updateMany.mockResolvedValue({ count: 0 });

        await expect(service.announceEndedCountdowns(now)).resolves.toBe(0);
        expect(emitter.emit).not.toHaveBeenCalled();
      });
    });
  });

  describe('a link', () => {
    const link = (url = 'https://shop.example.com/x') =>
      sticker({ kind: 'LINK', settings: { url } });
    const create = (stickers: CreateStoryStickerDto[]) =>
      service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        stickers,
        null,
      );

    it('is saved when its domain is not blocked', async () => {
      await create([link()]);

      expect(prisma.blockedLinkDomain.findFirst).toHaveBeenCalledWith({
        where: { domain: { in: ['shop.example.com', 'example.com'] } },
        select: { id: true },
      });
      // DNS is asked before the transaction, never inside it.
      expect(validateTargetUrl).not.toHaveBeenCalled();
      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            kind: 'LINK',
            settings: {
              url: 'https://shop.example.com/x',
              domain: 'shop.example.com',
            },
          }),
        ],
      });
    });

    it('is refused under a blocked domain', async () => {
      prisma.blockedLinkDomain.findFirst.mockResolvedValueOnce({ id: 'b' });
      await expect(create([link()])).rejects.toThrow('LINK_DOMAIN_BLOCKED');
      expect(prisma.storySticker.createMany).not.toHaveBeenCalled();
    });

    it('is checked to resolve only to public addresses, and refused when it does not', async () => {
      await service.assertLinkHostsPublic([
        sticker({ kind: 'POLL', settings: {} }),
        link(),
      ]);
      expect(validateTargetUrl).toHaveBeenCalledTimes(1);
      expect(validateTargetUrl).toHaveBeenCalledWith(
        'https://shop.example.com/x',
        { requireHttps: true, allowedPorts: [443] },
      );

      vi.mocked(validateTargetUrl).mockRejectedValueOnce(new Error('private'));
      await expect(service.assertLinkHostsPublic([link()])).rejects.toThrow(
        'LINK_HOST_NOT_ALLOWED',
      );
    });

    it('goes once per story, and up to ten a day per profile', async () => {
      await expect(create([link(), link()])).rejects.toThrow(
        'ONE_LINK_STICKER_PER_STORY',
      );

      prisma.storySticker.count.mockResolvedValueOnce(10);
      await expect(create([link()])).rejects.toThrow('LINKS_PER_DAY_REACHED');
      // The author is locked before the count, so two stories at once wait
      // for each other.
      const [sql, id] = prisma.$queryRaw.mock.calls[0];
      expect(sql.join('?')).toMatch(/FROM profiles WHERE id = \? FOR UPDATE/);
      expect(id).toBe(AUTHOR);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.storySticker.count.mock.invocationCallOrder[0],
      );
      expect(prisma.storySticker.count.mock.calls[0][0].where).toMatchObject({
        kind: 'LINK',
        story: { profileId: AUTHOR },
      });
    });

    it('is left out of the feed under a blocked domain, or while its author is sanctioned', async () => {
      const row = {
        id: 'l',
        kind: 'LINK' as const,
        settings: { url: 'https://a.example.com/', domain: 'a.example.com' },
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      };
      prisma.blockedLinkDomain.findMany.mockResolvedValueOnce([
        { domain: 'example.com' },
      ]);
      const blockedDomains = await service.blockedLinkDomains([row]);
      expect(prisma.blockedLinkDomain.findMany).toHaveBeenCalledWith({
        where: { domain: { in: ['a.example.com', 'example.com'] } },
        select: { domain: true },
      });
      const names = { usernames: new Map(), placeName: null };

      expect(service.forFeed([row], false, names)).toHaveLength(1);
      expect(
        service.forFeed([row], false, { ...names, blockedDomains }),
      ).toEqual([]);
      expect(
        service.forFeed([row], false, { ...names, linksOff: true }),
      ).toEqual([]);
      await expect(service.blockedLinkDomains([])).resolves.toEqual(new Set());
    });
  });

  describe('music', () => {
    const music = () => sticker({ kind: 'MUSIC', settings: { audioId: 'x' } });

    it('is the story’s own track, whatever the app sends, once per story', async () => {
      await service.createForStory(
        prisma as never,
        'story-1',
        AUTHOR,
        [music()],
        null,
        'track-1',
      );
      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            kind: 'MUSIC',
            settings: { audioId: 'track-1' },
          }),
        ],
      });

      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [music(), music()],
          null,
          'track-1',
        ),
      ).rejects.toThrow('ONE_MUSIC_STICKER_PER_STORY');
    });

    it('is refused on a story with no track', async () => {
      await expect(
        service.createForStory(
          prisma as never,
          'story-1',
          AUTHOR,
          [music()],
          null,
        ),
      ).rejects.toThrow('AUDIO_NOT_FOUND');
    });

    it('goes to the feed with the track’s title, artist and cover, and not without a track', () => {
      const row = {
        id: 'm',
        kind: 'MUSIC' as const,
        settings: { audioId: 'track-1' },
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
      };
      const names = { usernames: new Map(), placeName: null };

      expect(
        service.forFeed([row], false, {
          ...names,
          track: { title: 'Luz', artist: 'Ana', cover: 'https://c/1.jpg' },
        })[0].settings,
      ).toEqual({
        audioId: 'track-1',
        title: 'Luz',
        artist: 'Ana',
        cover: 'https://c/1.jpg',
      });
      expect(service.forFeed([row], false, names)).toEqual([]);
    });
  });
});
