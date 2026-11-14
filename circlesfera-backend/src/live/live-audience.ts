import type { LiveAudience, Prisma } from '@prisma/client';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { isStreamHost } from './live-authorization.js';
import { GUEST_PLACE_STATUSES } from './live-guest.policy.js';

// A stream is shown only while its host may be seen: not banned, not
// suspended, and with an account that is open.
export const HOST_SHOWN_SELECT = {
  isAccountBanned: true,
  suspendedUntil: true,
  user: { select: { isActive: true, deactivatedAt: true } },
} as const;

export function hostShown(host: {
  isAccountBanned: boolean;
  suspendedUntil: Date | null;
  user: { isActive: boolean; deactivatedAt: Date | null } | null;
}): boolean {
  return (
    !host.isAccountBanned &&
    (!host.suspendedUntil || host.suspendedUntil < new Date()) &&
    !!host.user?.isActive &&
    !host.user.deactivatedAt
  );
}

/**
 * Who a live is for, in one place: the list of lives, the token to watch,
 * the live's own page and its room for comments all ask here.
 *
 * - Everyone: whoever can see the host (blocks are checked by the caller).
 * - Close friends: the people on the host's close friends list.
 * - Practice: only the host and their guests; nobody else ever sees it.
 *
 * The host and a guest with a place (invited or on air) always see their
 * own live. Anyone else in a block with a guest on air, whoever blocked whom,
 * does not see the live while that guest is on air; the host is not told.
 */
export interface StreamAudienceFields {
  id: string;
  hostId: string;
  audience: LiveAudience;
}

/**
 * Whether the viewer is a guest of the live with a place (invited or on
 * air), or else in a block with one of its guests on air.
 */
async function guestStanding(
  prisma: Pick<PrismaService, 'liveGuest' | 'block'>,
  streamId: string,
  viewerProfileId: string,
): Promise<'GUEST' | 'BLOCKED' | null> {
  const guests = await prisma.liveGuest.findMany({
    where: { streamId, status: { in: [...GUEST_PLACE_STATUSES] } },
    select: { profileId: true, status: true },
  });
  if (guests.some((guest) => guest.profileId === viewerProfileId)) {
    return 'GUEST';
  }
  const onAir = guests
    .filter((guest) => guest.status === 'ON_AIR')
    .map((guest) => guest.profileId);
  if (onAir.length === 0) return null;
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: viewerProfileId, blockedId: { in: onAir } },
        { blockedId: viewerProfileId, blockerId: { in: onAir } },
      ],
    },
    select: { id: true },
  });
  return block ? 'BLOCKED' : null;
}

export async function canWatchStream(
  prisma: Pick<PrismaService, 'closeFriend' | 'liveGuest' | 'block'>,
  stream: StreamAudienceFields,
  viewerProfileId: string | undefined,
): Promise<boolean> {
  if (viewerProfileId && isStreamHost(stream, viewerProfileId)) return true;
  if (!viewerProfileId) return stream.audience === 'EVERYONE';
  const standing = await guestStanding(prisma, stream.id, viewerProfileId);
  if (standing === 'GUEST') return true;
  if (standing === 'BLOCKED') return false;
  if (stream.audience === 'EVERYONE') return true;
  if (stream.audience === 'PRACTICE') return false;
  const friend = await prisma.closeFriend.findUnique({
    where: {
      profileId_friendId: {
        profileId: stream.hostId,
        friendId: viewerProfileId,
      },
    },
    select: { id: true },
  });
  return friend !== null;
}

/**
 * The lives a viewer may find in the list: those for everyone, those for
 * close friends whose host has the viewer on their list, and their own as
 * host or as a guest invited or on air. Nobody else ever finds a practice,
 * nor a live while a guest on air is in a block with them (`blockedIds`:
 * the Profiles the viewer blocked or was blocked by).
 */
export function listedForViewer(
  viewerProfileId: string | undefined,
  blockedIds: string[] = [],
): Prisma.LiveStreamWhereInput {
  if (!viewerProfileId) return { audience: 'EVERYONE' };
  return {
    OR: [
      {
        OR: [
          { audience: 'EVERYONE' },
          {
            audience: 'CLOSE_FRIENDS',
            host: { closeFriends: { some: { friendId: viewerProfileId } } },
          },
        ],
        ...(blockedIds.length > 0
          ? {
              NOT: {
                guests: {
                  some: { status: 'ON_AIR', profileId: { in: blockedIds } },
                },
              },
            }
          : {}),
      },
      { hostId: viewerProfileId },
      {
        guests: {
          some: {
            profileId: viewerProfileId,
            status: { in: [...GUEST_PLACE_STATUSES] },
          },
        },
      },
    ],
  };
}

/**
 * Whether a viewer may be in a live's room, where its comments and hearts
 * are: the same as being let in to watch it. The live is on air, its host
 * may be seen, no block stands either way, and it is for the viewer.
 */
export async function canEnterStreamRoom(
  prisma: PrismaService,
  streamId: string,
  viewerProfileId: string,
): Promise<boolean> {
  const stream = await prisma.liveStream.findUnique({
    where: { id: streamId },
    select: {
      id: true,
      status: true,
      hostId: true,
      audience: true,
      host: { select: HOST_SHOWN_SELECT },
    },
  });
  if (stream?.status !== 'LIVE' || !hostShown(stream.host)) return false;
  if (await isBlockedEitherWay(prisma, viewerProfileId, stream.hostId)) {
    return false;
  }
  return canWatchStream(prisma, stream, viewerProfileId);
}
