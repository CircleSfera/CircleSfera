import type { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canSeeProfileLives,
  canWatchLiveReplay,
  replaysListedFor,
} from './live-replay-access.policy.js';

describe('live replay access', () => {
  const db = {
    block: { findFirst: vi.fn() },
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
    follow: { findUnique: vi.fn() },
    closeFriend: { findUnique: vi.fn() },
  };
  const reader = db as unknown as Prisma.TransactionClient;

  beforeEach(() => {
    vi.clearAllMocks();
    db.block.findFirst.mockResolvedValue(null);
    db.profile.findMany.mockResolvedValue([]);
    db.user.findMany.mockResolvedValue([]);
    db.profile.findUnique.mockResolvedValue({ privacyLevel: 'PUBLIC' });
    db.follow.findUnique.mockResolvedValue(null);
    db.closeFriend.findUnique.mockResolvedValue(null);
  });

  describe('canSeeProfileLives', () => {
    it('lets the host see their own', async () => {
      expect(await canSeeProfileLives(reader, 'host', 'host')).toBe(true);
      expect(db.profile.findUnique).not.toHaveBeenCalled();
    });

    it('lets anyone see those of a public Profile', async () => {
      expect(await canSeeProfileLives(reader, 'host', null)).toBe(true);
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(true);
    });

    it('hides them across a block', async () => {
      db.block.findFirst.mockResolvedValue({ id: 'b' });
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(false);
    });

    it('hides those of a Profile that does not exist', async () => {
      db.profile.findUnique.mockResolvedValue(null);
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(false);
    });

    it('keeps those of a private Profile for its accepted followers', async () => {
      db.profile.findUnique.mockResolvedValue({ privacyLevel: 'PRIVATE' });
      expect(await canSeeProfileLives(reader, 'host', null)).toBe(false);
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(false);
      db.follow.findUnique.mockResolvedValue({ status: 'PENDING' });
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(false);
      db.follow.findUnique.mockResolvedValue({ status: 'ACCEPTED' });
      expect(await canSeeProfileLives(reader, 'host', 'viewer')).toBe(true);
    });
  });

  describe('canWatchLiveReplay', () => {
    const replay = {
      hostId: 'host',
      publishedAt: new Date(),
      endedByStaff: false,
      audience: 'EVERYONE' as const,
    };

    it('gives a recording of a broadcast ended by staff to no one', async () => {
      expect(
        await canWatchLiveReplay(
          reader,
          { ...replay, endedByStaff: true },
          'host',
        ),
      ).toBe(false);
    });

    it('keeps a recording not published for its host', async () => {
      const kept = { ...replay, publishedAt: null };
      expect(await canWatchLiveReplay(reader, kept, 'host')).toBe(true);
      expect(await canWatchLiveReplay(reader, kept, 'viewer')).toBe(false);
    });

    it("gives a published recording the Profile's audience", async () => {
      expect(await canWatchLiveReplay(reader, replay, 'viewer')).toBe(true);
      db.block.findFirst.mockResolvedValue({ id: 'b' });
      expect(await canWatchLiveReplay(reader, replay, 'viewer')).toBe(false);
    });

    it('keeps a recording of a live for close friends for them', async () => {
      const forFriends = { ...replay, audience: 'CLOSE_FRIENDS' as const };
      expect(await canWatchLiveReplay(reader, forFriends, 'viewer')).toBe(
        false,
      );
      expect(await canWatchLiveReplay(reader, forFriends, undefined)).toBe(
        false,
      );
      db.closeFriend.findUnique.mockResolvedValue({ id: 'cf' });
      expect(await canWatchLiveReplay(reader, forFriends, 'viewer')).toBe(true);
      expect(await canWatchLiveReplay(reader, forFriends, 'host')).toBe(true);
    });

    it('gives a practice to no one but its host', async () => {
      const practice = { ...replay, audience: 'PRACTICE' as const };
      db.closeFriend.findUnique.mockResolvedValue({ id: 'cf' });
      expect(await canWatchLiveReplay(reader, practice, 'viewer')).toBe(false);
      expect(await canWatchLiveReplay(reader, practice, 'host')).toBe(true);
    });
  });

  describe('replaysListedFor', () => {
    it('lists every recording to the host, and to others those for them', () => {
      expect(replaysListedFor('host', 'host')).toEqual({});
      expect(replaysListedFor('host', null)).toEqual({ audience: 'EVERYONE' });
      expect(replaysListedFor('host', 'viewer')).toEqual({
        OR: [
          { audience: 'EVERYONE' },
          {
            audience: 'CLOSE_FRIENDS',
            host: { closeFriends: { some: { friendId: 'viewer' } } },
          },
        ],
      });
    });
  });
});
