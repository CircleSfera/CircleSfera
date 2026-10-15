import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStoryStickerDto } from './dto/story-sticker.dto.js';
import { StoryStickersService } from './story-stickers.service.js';

const AUTHOR = 'author';
const VIEWER = 'viewer';
const later = new Date(Date.now() + 3_600_000);

function prismaMock() {
  return {
    user: { findMany: vi.fn().mockResolvedValue([]) },
    block: { findFirst: vi.fn().mockResolvedValue(null) },
    follow: { findUnique: vi.fn() },
    closeFriend: { findUnique: vi.fn() },
    profile: { findUnique: vi.fn().mockResolvedValue({ id: 'mentioned' }) },
    place: { findUnique: vi.fn().mockResolvedValue({ id: 'place-1' }) },
    story: {
      findUnique: vi.fn().mockResolvedValue({
        profileId: AUTHOR,
        expiresAt: later,
        isCloseFriendsOnly: false,
        profile: { privacyLevel: 'PUBLIC' },
      }),
    },
    storySticker: { findUnique: vi.fn(), createMany: vi.fn() },
    storyStickerResponse: {
      create: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const place = { x: 0.1, y: -0.2, scale: 1, rotation: 0 };
const sticker = (over: Partial<CreateStoryStickerDto>) =>
  ({ ...place, ...over }) as CreateStoryStickerDto;

describe('StoryStickersService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: StoryStickersService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new StoryStickersService(prisma as unknown as PrismaService);
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
      await service.createForStory(prisma as never, 'story-1', AUTHOR, [
        sticker({
          kind: 'POLL',
          settings: { question: ' ¿Playa? ', options: ['Sí', 'No'] },
        }),
        sticker({ kind: 'HASHTAG', settings: { tag: '#verano' }, scale: 3 }),
      ]);

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
      await service.createForStory(prisma as never, 'story-1', AUTHOR, []);
      expect(prisma.storySticker.createMany).not.toHaveBeenCalled();
    });

    it('keeps a poll, a question, a quiz and a slider within the sizes of the editor', async () => {
      await expect(
        service.createForStory(prisma as never, 'story-1', AUTHOR, [
          sticker({
            kind: 'POLL',
            settings: { question: 'Q', options: ['a', 'b'] },
            scale: 2,
          }),
        ]),
      ).rejects.toThrow('STICKER_SCALE_OUT_OF_RANGE');
    });

    it('refuses a mention of a profile that does not exist or is blocked', async () => {
      prisma.profile.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createForStory(prisma as never, 'story-1', AUTHOR, [
          sticker({ kind: 'MENTION', settings: { profileId: 'ghost' } }),
        ]),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');

      prisma.block.findFirst.mockResolvedValueOnce({ id: 'b' });
      await expect(
        service.createForStory(prisma as never, 'story-1', AUTHOR, [
          sticker({ kind: 'MENTION', settings: { profileId: 'mentioned' } }),
        ]),
      ).rejects.toThrow('MENTIONED_PROFILE_NOT_FOUND');
    });

    it('refuses a place that does not exist', async () => {
      prisma.place.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.createForStory(prisma as never, 'story-1', AUTHOR, [
          sticker({ kind: 'LOCATION', settings: { placeId: 'nowhere' } }),
        ]),
      ).rejects.toThrow('PLACE_NOT_FOUND');
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

      const forAuthor = await service.results(AUTHOR, 'st-1');
      expect(forAuthor).toMatchObject({ totalResponses: 1, isAuthor: true });
      expect(forAuthor.answers).toHaveLength(1);
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
});
