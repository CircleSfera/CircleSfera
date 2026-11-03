import { NotFoundException } from '@nestjs/common';
import type { Prisma, StoryStickerKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LISTED_POST } from '../common/policies/removed-content.policy.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStoryStickerDto } from './dto/story-sticker.dto.js';
import { LINK_LIMITS } from './link-safety.js';
import { POST_STICKER_MAX } from './story-sticker-settings.js';
import { StoryStickersService } from './story-stickers.service.js';

const AUTHOR = 'author';
const VIEWER = 'viewer';

function prismaMock() {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    follow: { findUnique: vi.fn().mockResolvedValue(null) },
    profile: {
      findUnique: vi.fn().mockResolvedValue({ id: 'mentioned' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    post: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    story: { findUnique: vi.fn() },
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
const poll = () =>
  sticker({
    kind: 'POLL',
    settings: { question: '¿Playa?', options: ['Sí', 'No'] },
  });

/** A post as the access rule reads it, open to everyone. */
const openPost = (over: Record<string, unknown> = {}) => ({
  id: 'post-1',
  profileId: AUTHOR,
  visibility: 'PUBLIC',
  moderationStatus: 'VISIBLE',
  deletedAt: null,
  archivedAt: null,
  turnOffComments: false,
  scheduledStatus: 'PUBLISHED',
  profile: { privacyLevel: 'PUBLIC' },
  ...over,
});

describe('StoryStickersService on the photos of a post', () => {
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

  describe('creating them with a new post', () => {
    const create = (
      media: { postMediaId: string; stickers: CreateStoryStickerDto[] }[],
      placeId: string | null = null,
      audioId: string | null = null,
    ) =>
      service.createForPost(prisma as never, AUTHOR, media, placeId, audioId);

    it('saves each on the photo it was placed on, in one go', async () => {
      await create([
        { postMediaId: 'pm-1', stickers: [poll()] },
        { postMediaId: 'pm-2', stickers: [] },
        {
          postMediaId: 'pm-3',
          stickers: [
            sticker({ kind: 'HASHTAG', settings: { tag: '#verano' } }),
          ],
        },
      ]);

      expect(prisma.storySticker.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.storySticker.createMany).toHaveBeenCalledWith({
        data: [
          {
            postMediaId: 'pm-1',
            kind: 'POLL',
            settings: { question: '¿Playa?', options: ['Sí', 'No'] },
            ...place,
          },
          {
            postMediaId: 'pm-3',
            kind: 'HASHTAG',
            settings: { tag: 'verano' },
            ...place,
          },
        ],
      });
    });

    it('creates nothing when no photo has a sticker', async () => {
      await expect(
        create([{ postMediaId: 'pm-1', stickers: [] }]),
      ).resolves.toEqual([]);
      expect(prisma.storySticker.createMany).not.toHaveBeenCalled();
    });

    it('takes as many as a story, all the photos together, and no more', async () => {
      const half = Math.ceil(POST_STICKER_MAX / 2);
      const many = (n: number) => Array.from({ length: n }, poll);

      await create([
        { postMediaId: 'pm-1', stickers: many(half) },
        { postMediaId: 'pm-2', stickers: many(POST_STICKER_MAX - half) },
      ]);
      await expect(
        create([
          { postMediaId: 'pm-1', stickers: many(half) },
          { postMediaId: 'pm-2', stickers: many(POST_STICKER_MAX - half + 1) },
        ]),
      ).rejects.toThrow('TOO_MANY_STICKERS');
      expect(prisma.storySticker.createMany).toHaveBeenCalledTimes(1);
    });

    it('refuses a sticker that shares a post, which belongs to stories only', async () => {
      await expect(
        create([
          {
            postMediaId: 'pm-1',
            stickers: [sticker({ kind: 'POST', settings: { postId: 'p-9' } })],
          },
        ]),
      ).rejects.toThrow('STICKER_KIND_NOT_ON_POSTS');
      expect(prisma.storySticker.createMany).not.toHaveBeenCalled();
    });

    it("gives a location the post's own place, once per post", async () => {
      const location = () => sticker({ kind: 'LOCATION', settings: {} });

      await create(
        [{ postMediaId: 'pm-1', stickers: [location()] }],
        'place-1',
      );
      expect(
        prisma.storySticker.createMany.mock.calls[0][0].data[0].settings,
      ).toEqual({ placeId: 'place-1' });

      await expect(
        create([{ postMediaId: 'pm-1', stickers: [location()] }], null),
      ).rejects.toThrow('PLACE_NOT_FOUND');
      await expect(
        create(
          [
            { postMediaId: 'pm-1', stickers: [location()] },
            { postMediaId: 'pm-2', stickers: [location()] },
          ],
          'place-1',
        ),
      ).rejects.toThrow('ONE_LOCATION_STICKER_PER_POST');
    });

    it("gives a music sticker the post's own song, once per post", async () => {
      const music = () => sticker({ kind: 'MUSIC', settings: {} });

      await create(
        [{ postMediaId: 'pm-1', stickers: [music()] }],
        null,
        'song-1',
      );
      expect(
        prisma.storySticker.createMany.mock.calls[0][0].data[0].settings,
      ).toEqual({ audioId: 'song-1' });

      await expect(
        create([{ postMediaId: 'pm-1', stickers: [music()] }]),
      ).rejects.toThrow('AUDIO_NOT_FOUND');
      await expect(
        create(
          [
            { postMediaId: 'pm-1', stickers: [music()] },
            { postMediaId: 'pm-2', stickers: [music()] },
          ],
          null,
          'song-1',
        ),
      ).rejects.toThrow('ONE_MUSIC_STICKER_PER_POST');
    });

    it('mentions a profile that exists and is not blocked either way, and answers who to tell', async () => {
      const mention = (profileId: string) =>
        sticker({ kind: 'MENTION', settings: { profileId } });

      await expect(
        create([
          { postMediaId: 'pm-1', stickers: [mention('ana'), mention(AUTHOR)] },
          { postMediaId: 'pm-2', stickers: [mention('ana')] },
        ]),
      ).resolves.toEqual(['ana']);

      prisma.profile.findUnique.mockResolvedValueOnce(null);
      await expect(
        create([{ postMediaId: 'pm-1', stickers: [mention('gone')] }]),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');

      prisma.block.findFirst.mockResolvedValueOnce({ id: 'b-1' });
      await expect(
        create([{ postMediaId: 'pm-1', stickers: [mention('blocker')] }]),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');
    });

    describe('a link', () => {
      const link = () =>
        sticker({
          kind: 'LINK',
          settings: { url: 'https://shop.example.com/x' },
        });

      it('is refused when its domain is blocked by staff', async () => {
        prisma.blockedLinkDomain.findFirst.mockResolvedValueOnce({ id: 'd-1' });

        await expect(
          create([{ postMediaId: 'pm-1', stickers: [link()] }]),
        ).rejects.toThrow('LINK_DOMAIN_BLOCKED');
      });

      it('is one per post', async () => {
        await expect(
          create([
            { postMediaId: 'pm-1', stickers: [link()] },
            { postMediaId: 'pm-2', stickers: [link()] },
          ]),
        ).rejects.toThrow('ONE_LINK_STICKER_PER_POST');
      });

      it("counts toward the author's day with the links of their stories", async () => {
        prisma.storySticker.count
          .mockResolvedValueOnce(LINK_LIMITS.perDay - 1)
          .mockResolvedValueOnce(1);

        await expect(
          create([{ postMediaId: 'pm-1', stickers: [link()] }]),
        ).rejects.toThrow('LINKS_PER_DAY_REACHED');
        expect(prisma.storySticker.count.mock.calls[1][0].where).toMatchObject({
          kind: 'LINK',
          postMedia: { post: { profileId: AUTHOR } },
        });
      });
    });
  });

  describe('answering and reading one', () => {
    const holds = (kind: string, settings: object) =>
      prisma.storySticker.findUnique.mockResolvedValue({
        id: 'st-1',
        storyId: null,
        kind,
        settings,
        postMedia: { postId: 'post-1' },
      });
    const pollSettings = { question: '¿Playa?', options: ['Sí', 'No'] };

    beforeEach(() => {
      holds('POLL', pollSettings);
      prisma.post.findUnique.mockResolvedValue(openPost());
    });

    it('takes a vote from whoever can see the post, with no story to end', async () => {
      const result = await service.respond(VIEWER, 'st-1', { optionIndex: 1 });

      expect(prisma.post.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'post-1' } }),
      );
      expect(prisma.story.findUnique).not.toHaveBeenCalled();
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
      expect(result).toMatchObject({ isAuthor: false });
      expect(result).not.toHaveProperty('responders');
    });

    it("is not answered by the post's author", async () => {
      await expect(
        service.respond(AUTHOR, 'st-1', { optionIndex: 0 }),
      ).rejects.toThrow('CANNOT_ANSWER_OWN_STICKER');
    });

    it('shows who answered to the author only', async () => {
      await expect(service.results(AUTHOR, 'st-1')).resolves.toMatchObject({
        isAuthor: true,
        responders: [],
      });
      await expect(service.results(VIEWER, 'st-1')).resolves.not.toHaveProperty(
        'responders',
      );
    });

    it.each([
      ['removed by moderation', { moderationStatus: 'REMOVED' }],
      ['deleted by its author', { deletedAt: new Date() }],
      ['archived by its author', { archivedAt: new Date() }],
      ['hidden by moderation', { moderationStatus: 'HIDDEN' }],
      ['not out yet', { scheduledStatus: 'SCHEDULED' }],
      ['private', { visibility: 'PRIVATE' }],
      ['for followers only', { visibility: 'FOLLOWERS' }],
      ['of a private account', { profile: { privacyLevel: 'PRIVATE' } }],
    ])('answers as a missing sticker when the post is %s', async (_, over) => {
      prisma.post.findUnique.mockResolvedValue(openPost(over));

      for (const call of [
        service.respond(VIEWER, 'st-1', { optionIndex: 0 }),
        service.results(VIEWER, 'st-1'),
      ]) {
        const err = await call.catch((e: unknown) => e);
        expect(err).toBeInstanceOf(NotFoundException);
        expect((err as Error).message).toBe('Sticker not found');
      }
      expect(prisma.storyStickerResponse.upsert).not.toHaveBeenCalled();
    });

    it('answers as a missing sticker when the post and the viewer have blocked each other', async () => {
      prisma.block.findFirst.mockResolvedValue({ id: 'b-1' });

      await expect(service.results(VIEWER, 'st-1')).rejects.toThrow(
        'Sticker not found',
      );
    });

    it('answers as a missing sticker when the post is gone, or the sticker has no owner', async () => {
      prisma.post.findUnique.mockResolvedValue(null);
      await expect(service.results(VIEWER, 'st-1')).rejects.toThrow(
        'Sticker not found',
      );

      prisma.storySticker.findUnique.mockResolvedValue({
        id: 'st-1',
        storyId: null,
        kind: 'POLL',
        settings: pollSettings,
        postMedia: null,
      });
      await expect(service.results(VIEWER, 'st-1')).rejects.toThrow(
        'Sticker not found',
      );
    });

    it('lets the author read it on their own post that is archived or not out yet', async () => {
      prisma.post.findUnique.mockResolvedValue(
        openPost({ archivedAt: new Date(), scheduledStatus: 'SCHEDULED' }),
      );

      await expect(service.results(AUTHOR, 'st-1')).resolves.toMatchObject({
        isAuthor: true,
      });
    });

    it('lets a failure to read who follows whom through as it is', async () => {
      prisma.post.findUnique.mockResolvedValue(
        openPost({ profile: { privacyLevel: 'PRIVATE' } }),
      );
      prisma.follow.findUnique.mockRejectedValue(new Error('db down'));

      await expect(service.results(VIEWER, 'st-1')).rejects.toThrow('db down');
    });
  });

  describe('a countdown that ends', () => {
    const now = new Date('2026-10-20T20:00:00Z');

    it('tells who asked and the author, linking the post', async () => {
      prisma.post.findMany.mockResolvedValue([
        {
          id: 'post-1',
          profileId: AUTHOR,
          media: [
            {
              stickers: [
                { id: 'st-9', settings: { title: 'Fiesta', endsAt: now } },
              ],
            },
            { stickers: [] },
          ],
        },
      ]);
      prisma.storyStickerResponse.findMany.mockResolvedValue([
        { profileId: 'ana' },
      ]);

      await expect(service.announceEndedCountdowns(now)).resolves.toBe(2);

      const where = prisma.post.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        ...LISTED_POST,
        scheduledStatus: 'PUBLISHED',
      });
      expect(prisma.storySticker.updateMany).toHaveBeenCalledWith({
        where: { id: 'st-9', announcedAt: null },
        data: { announcedAt: now },
      });
      expect(emitter.emit.mock.calls.map(([, p]) => p)).toEqual([
        {
          recipientId: 'ana',
          senderId: AUTHOR,
          type: 'SYSTEM',
          notice: { key: 'countdown_ended', title: 'Fiesta' },
          postId: 'post-1',
        },
        {
          recipientId: AUTHOR,
          senderId: AUTHOR,
          type: 'SYSTEM',
          notice: { key: 'countdown_ended', title: 'Fiesta' },
          postId: 'post-1',
        },
      ]);
    });
  });

  describe('as a viewer sees them', () => {
    const row = (
      kind: StoryStickerKind,
      settings: Prisma.JsonObject,
      id = `s-${kind}`,
    ) => ({
      id,
      kind,
      settings,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    });
    const quiz = row('QUIZ', {
      question: '¿Capital?',
      options: ['Roma', 'París'],
      correctIndex: 1,
    });
    const post = (stickers: ReturnType<typeof row>[]) => ({
      id: 'post-1',
      profileId: AUTHOR,
      caption: 'x',
      media: [{ id: 'pm-1', url: '/a.jpg', stickers }],
    });
    const owner = (over: Record<string, unknown> = {}) => ({
      id: 'post-1',
      place: { name: 'Madrid' },
      audio: { title: 'Luz', artist: 'Ana', thumbnailUrl: null },
      profile: { isAccountBanned: false, suspendedUntil: null },
      ...over,
    });

    it('leaves posts with no stickers as they are, reading nothing', async () => {
      const posts = [post([]), { id: 'p-2', profileId: AUTHOR }];

      await expect(service.forPostViewers(posts, VIEWER)).resolves.toBe(posts);
      expect(prisma.post.findMany).not.toHaveBeenCalled();
    });

    it("keeps a quiz's answer from a viewer and shows it to the author", async () => {
      prisma.post.findMany.mockResolvedValue([owner()]);

      const [seen] = await service.forPostViewers([post([quiz])], VIEWER);
      const [own] = await service.forPostViewers([post([quiz])], AUTHOR);

      expect(seen.media[0].stickers[0].settings).not.toHaveProperty(
        'correctIndex',
      );
      expect(own.media[0].stickers[0].settings).toHaveProperty(
        'correctIndex',
        1,
      );
      expect(seen.caption).toBe('x');
      expect(seen.media[0].url).toBe('/a.jpg');
    });

    it("writes a mention's username, the post's place and song, and leaves out what cannot be shown", async () => {
      prisma.post.findMany.mockResolvedValue([owner()]);
      prisma.profile.findMany.mockResolvedValue([
        { id: 'ana', username: 'ana.b' },
      ]);
      prisma.blockedLinkDomain.findMany.mockResolvedValue([
        { domain: 'bad.example' },
      ]);

      const [seen] = await service.forPostViewers(
        [
          post([
            row('MENTION', { profileId: 'ana' }, 'm-1'),
            row('MENTION', { profileId: 'blocked' }, 'm-2'),
            row('LOCATION', { placeId: 'place-1' }),
            row('MUSIC', { audioId: 'song-1' }),
            row('LINK', {
              url: 'https://bad.example/x',
              domain: 'bad.example',
            }),
          ]),
        ],
        VIEWER,
      );

      expect(seen.media[0].stickers.map((s) => s.settings)).toEqual([
        { profileId: 'ana', username: 'ana.b' },
        { placeId: 'place-1', name: 'Madrid' },
        {
          audioId: 'song-1',
          title: 'Luz',
          artist: 'Ana',
          cover: null,
        },
      ]);
    });

    it('takes the links off an author who is banned or suspended', async () => {
      const links = [
        row('LINK', { url: 'https://shop.example/x', domain: 'shop.example' }),
      ];

      prisma.post.findMany.mockResolvedValue([
        owner({ profile: { isAccountBanned: true, suspendedUntil: null } }),
      ]);
      const [banned] = await service.forPostViewers([post(links)], VIEWER);
      prisma.post.findMany.mockResolvedValue([
        owner({
          profile: {
            isAccountBanned: false,
            suspendedUntil: new Date(Date.now() + 60_000),
          },
        }),
      ]);
      const [suspended] = await service.forPostViewers([post(links)], VIEWER);
      prisma.post.findMany.mockResolvedValue([
        owner({ place: null, audio: null }),
      ]);
      const [fine] = await service.forPostViewers([post(links)], null);

      expect(banned.media[0].stickers).toEqual([]);
      expect(suspended.media[0].stickers).toEqual([]);
      expect(fine.media[0].stickers).toHaveLength(1);
    });

    it('leaves a post it could not read again as it came', async () => {
      prisma.post.findMany.mockResolvedValue([]);
      const posts = [post([quiz])];

      await expect(service.forPostViewers(posts, VIEWER)).resolves.toEqual(
        posts,
      );
    });
  });
});
