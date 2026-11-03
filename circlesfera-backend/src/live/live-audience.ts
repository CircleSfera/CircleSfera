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
 * the live's own page, its room for comments and its gifts all ask here.
 *
 * - Everyone: whoever can see the host (blocks are checked by the caller).
 * - Close friends: the people on the host's close friends list.
 * - Practice: only the host and their guests; nobody else ever sees it.
 *
 * The host and a guest with a place (invited or on air) always see their
 * own live.
 */
export interface StreamAudienceFields {
  id: string;
  hostId: string;
  audience: LiveAudience;
}

/** Whether the Profile is a guest invited to the live, or on air in it. */
export async function hasGuestPlace(
  prisma: Pick<PrismaService, 'liveGuest'>,
  streamId: string,
  profileId: string,
): Promise<boolean> {
  const guest = await prisma.liveGuest.findFirst({
    where: {
      streamId,
      profileId,
      status: { in: [...GUEST_PLACE_STATUSES] },
    },
    select: { id: true },
  });
  return guest !== null;
}

export async function canWatchStream(
  prisma: Pick<PrismaService, 'closeFriend' | 'liveGuest'>,
  stream: StreamAudienceFields,
  viewerProfileId: string | undefined,
): Promise<boolean> {
  if (viewerProfileId && isStreamHost(stream, viewerProfileId)) return true;
  if (stream.audience === 'EVERYONE') return true;
  if (!viewerProfileId) return false;
  if (await hasGuestPlace(prisma, stream.id, viewerProfileId)) return true;
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
 * host or as a guest invited or on air. Nobody else ever finds a practice.
 */
export function listedForViewer(
  viewerProfileId: string | undefined,
): Prisma.LiveStreamWhereInput {
  if (!viewerProfileId) return { audience: 'EVERYONE' };
  return {
    OR: [
      { audience: 'EVERYONE' },
      {
        audience: 'CLOSE_FRIENDS',
        host: { closeFriends: { some: { friendId: viewerProfileId } } },
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
