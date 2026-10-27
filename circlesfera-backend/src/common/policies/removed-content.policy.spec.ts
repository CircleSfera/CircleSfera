import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setModerationStatus } from './moderation-decision.js';
import { assertCanAccessPost } from './post-access.policy.js';
import {
  isRemoved,
  NOT_REMOVED,
  SHOWN_COMMENTS_COUNT,
} from './removed-content.policy.js';

describe('removed content', () => {
  it('leaves out of lists and counts only what moderation removed', () => {
    expect(NOT_REMOVED).toEqual({ moderationStatus: { not: 'REMOVED' } });
    // A post's comment count counts what its list shows: no hidden or
    // removed comment, and no reply under one.
    const shown = { in: ['VISIBLE', 'FLAGGED'] };
    expect(SHOWN_COMMENTS_COUNT).toEqual({
      where: {
        moderationStatus: shown,
        OR: [
          { parentId: null },
          { parent: { parentId: null, moderationStatus: shown } },
        ],
      },
    });
    expect(isRemoved({ moderationStatus: 'REMOVED' })).toBe(true);
    for (const moderationStatus of ['VISIBLE', 'FLAGGED', 'HIDDEN', null]) {
      expect(isRemoved({ moderationStatus })).toBe(false);
    }
    expect(isRemoved({})).toBe(false);
  });

  it('a removed post is found by nobody, its author included; a hidden one by its author', async () => {
    const post = {
      id: 'p-1',
      profileId: 'author',
      visibility: 'PUBLIC' as const,
      turnOffComments: false,
      profile: { privacyLevel: 'PUBLIC' as const },
    };
    const db = { block: { findFirst: vi.fn() } } as never;

    for (const viewer of ['author', 'viewer', null]) {
      await expect(
        assertCanAccessPost(
          db,
          { ...post, moderationStatus: 'REMOVED' },
          viewer,
        ),
      ).rejects.toThrow(NotFoundException);
    }
    await expect(
      assertCanAccessPost(
        db,
        { ...post, moderationStatus: 'HIDDEN' },
        'author',
      ),
    ).resolves.toMatchObject({ id: 'p-1' });
  });
});

describe('setModerationStatus', () => {
  const answer = {
    id: 'x-1',
    profileId: 'author',
    moderationStatus: 'REMOVED',
  };
  const db = {
    post: { update: vi.fn() },
    story: { update: vi.fn() },
    comment: { update: vi.fn() },
  };
  const select = { id: true, profileId: true, moderationStatus: true };

  beforeEach(() => {
    vi.clearAllMocks();
    db.post.update.mockResolvedValue(answer);
    db.story.update.mockResolvedValue(answer);
    db.comment.update.mockResolvedValue(answer);
  });

  it('removes a post, a story or a comment without deleting it, and records when', async () => {
    const types = [
      ['POST', db.post.update],
      ['STORY', db.story.update],
      ['COMMENT', db.comment.update],
    ] as const;
    for (const [type, update] of types) {
      await expect(
        setModerationStatus(db as never, type, 'x-1', 'REMOVED', 'Spam'),
      ).resolves.toEqual(answer);
      expect(update).toHaveBeenCalledWith({
        where: { id: 'x-1' },
        data: {
          moderationStatus: 'REMOVED',
          moderationNote: 'Spam',
          moderatedAt: expect.any(Date),
        },
        select,
      });
    }
  });

  it('records when content was hidden, and clears nothing when it is shown again', async () => {
    await setModerationStatus(db as never, 'STORY', 'x-1', 'HIDDEN');
    expect(db.story.update).toHaveBeenLastCalledWith({
      where: { id: 'x-1' },
      data: {
        moderationStatus: 'HIDDEN',
        moderationNote: undefined,
        moderatedAt: expect.any(Date),
      },
      select,
    });

    await setModerationStatus(db as never, 'COMMENT', 'x-1', 'VISIBLE');
    expect(db.comment.update).toHaveBeenLastCalledWith({
      where: { id: 'x-1' },
      data: { moderationStatus: 'VISIBLE', moderationNote: undefined },
      select,
    });
  });
});
