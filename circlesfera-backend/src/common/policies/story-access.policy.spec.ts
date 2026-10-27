import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCanAccessStory } from './story-access.policy.js';

describe('assertCanAccessStory', () => {
  const expiresAt = new Date('2030-01-01');
  const prisma = {
    story: { findUnique: vi.fn() },
    follow: { findUnique: vi.fn() },
    closeFriend: { findUnique: vi.fn() },
    block: { findFirst: vi.fn() },
    // Who is a Test Account: nobody here.
    user: { findMany: vi.fn() },
  };
  const story = (over = {}) => ({
    profileId: 'author',
    expiresAt,
    isCloseFriendsOnly: false,
    moderationStatus: 'VISIBLE',
    profile: { privacyLevel: 'PUBLIC' },
    ...over,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.block.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
  });

  it('a visible public story is seen by anyone not blocked', async () => {
    prisma.story.findUnique.mockResolvedValue(story());

    await expect(
      assertCanAccessStory(prisma as never, 's1', 'viewer'),
    ).resolves.toEqual({ profileId: 'author', expiresAt });
  });

  it('a story hidden or removed by moderation is not found for others', async () => {
    for (const moderationStatus of ['HIDDEN', 'REMOVED']) {
      prisma.story.findUnique.mockResolvedValueOnce(
        story({ moderationStatus }),
      );
      await expect(
        assertCanAccessStory(prisma as never, 's1', 'viewer'),
      ).rejects.toThrow(NotFoundException);
    }
  });

  it('its author still reaches a hidden story', async () => {
    prisma.story.findUnique.mockResolvedValue(
      story({ moderationStatus: 'HIDDEN' }),
    );

    await expect(
      assertCanAccessStory(prisma as never, 's1', 'author'),
    ).resolves.toEqual({ profileId: 'author', expiresAt });
  });

  it('a removed story is kept for its six months and found by nobody, its author included', async () => {
    prisma.story.findUnique.mockResolvedValue(
      story({ moderationStatus: 'REMOVED' }),
    );

    for (const viewer of ['author', 'viewer']) {
      await expect(
        assertCanAccessStory(prisma as never, 's1', viewer),
      ).rejects.toThrow(NotFoundException);
    }
  });

  it('a flagged story waiting for review stays visible', async () => {
    prisma.story.findUnique.mockResolvedValue(
      story({ moderationStatus: 'FLAGGED' }),
    );

    await expect(
      assertCanAccessStory(prisma as never, 's1', 'viewer'),
    ).resolves.toBeDefined();
  });

  it('an unknown story, a private account not followed and close friends only are not found', async () => {
    prisma.story.findUnique.mockResolvedValueOnce(null);
    await expect(
      assertCanAccessStory(prisma as never, 'missing', 'viewer'),
    ).rejects.toThrow(NotFoundException);

    prisma.story.findUnique.mockResolvedValueOnce(
      story({ profile: { privacyLevel: 'PRIVATE' } }),
    );
    prisma.follow.findUnique.mockResolvedValueOnce(null);
    await expect(
      assertCanAccessStory(prisma as never, 's1', 'viewer'),
    ).rejects.toThrow(NotFoundException);

    prisma.story.findUnique.mockResolvedValueOnce(
      story({ isCloseFriendsOnly: true }),
    );
    prisma.closeFriend.findUnique.mockResolvedValueOnce(null);
    await expect(
      assertCanAccessStory(prisma as never, 's1', 'viewer'),
    ).rejects.toThrow(NotFoundException);
  });
});
