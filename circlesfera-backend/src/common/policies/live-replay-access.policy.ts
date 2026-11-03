import {
  FollowStatus,
  type LiveAudience,
  type Prisma,
  Visibility,
} from '@prisma/client';
import { isBlockedEitherWay } from './block.policy.js';

type Reader = Pick<
  Prisma.TransactionClient,
  'block' | 'profile' | 'user' | 'follow' | 'closeFriend'
>;

/** What decides who may watch the recording of a broadcast. */
export interface LiveReplayAudience {
  hostId: string;
  publishedAt: Date | null;
  endedByStaff: boolean;
  /** Who the broadcast was for; its recording keeps that audience. */
  audience: LiveAudience;
}

/**
 * Whether a viewer may see the Profile's published recordings at all: not
 * across a block (either way, or another audience), and on a private Profile
 * only its accepted followers. The host always may.
 */
export async function canSeeProfileLives(
  db: Reader,
  hostId: string,
  viewerProfileId: string | null | undefined,
): Promise<boolean> {
  if (viewerProfileId === hostId) return true;
  if (await isBlockedEitherWay(db, viewerProfileId, hostId)) return false;
  const host = await db.profile.findUnique({
    where: { id: hostId },
    select: { privacyLevel: true },
  });
  if (!host) return false;
  if (host.privacyLevel !== Visibility.PRIVATE) return true;
  if (!viewerProfileId) return false;
  const follow = await db.follow.findUnique({
    where: {
      followerId_followingId: {
        followerId: viewerProfileId,
        followingId: hostId,
      },
    },
    select: { status: true },
  });
  return follow?.status === FollowStatus.ACCEPTED;
}

/**
 * Whether a viewer may watch one recording. A recording of a broadcast
 * ended by staff is kept for their review and is no one's here, not even
 * the host's. One the host has not published is the host's only. One
 * published has the Profile's audience, narrowed to the host's close friends
 * when the broadcast was for them; a practice is never anyone else's.
 */
export async function canWatchLiveReplay(
  db: Reader,
  replay: LiveReplayAudience,
  viewerProfileId: string | null | undefined,
): Promise<boolean> {
  if (replay.endedByStaff) return false;
  if (viewerProfileId === replay.hostId) return true;
  if (!replay.publishedAt) return false;
  if (replay.audience === 'PRACTICE') return false;
  if (replay.audience === 'CLOSE_FRIENDS') {
    if (!viewerProfileId) return false;
    const friend = await db.closeFriend.findUnique({
      where: {
        profileId_friendId: {
          profileId: replay.hostId,
          friendId: viewerProfileId,
        },
      },
      select: { id: true },
    });
    if (!friend) return false;
  }
  return canSeeProfileLives(db, replay.hostId, viewerProfileId);
}

/**
 * The published recordings of a Profile a viewer may find: those of
 * broadcasts for everyone, and for close friends when the viewer is one; all
 * of them for the host.
 */
export function replaysListedFor(
  hostId: string,
  viewerProfileId: string | null | undefined,
): Prisma.LiveStreamWhereInput {
  if (viewerProfileId === hostId) return {};
  if (!viewerProfileId) return { audience: 'EVERYONE' };
  return {
    OR: [
      { audience: 'EVERYONE' },
      {
        audience: 'CLOSE_FRIENDS',
        host: { closeFriends: { some: { friendId: viewerProfileId } } },
      },
    ],
  };
}
