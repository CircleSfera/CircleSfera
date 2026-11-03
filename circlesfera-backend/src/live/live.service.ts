import type { UserSessionTerminateEvent } from '@circlesfera/shared';
import { DEFAULT_LIVE_AUDIENCE, ErrorCode } from '@circlesfera/shared';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { LiveAudience, LiveGuestStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/errors/app.exception.js';
import {
  getBlockedProfileIds,
  isBlockedEitherWay,
  visibleToViewerWhere,
} from '../common/policies/block.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import {
  canWatchStream,
  HOST_SHOWN_SELECT,
  hostShown,
  listedForViewer,
} from './live-audience.js';
import { isStreamHost } from './live-authorization.js';
import {
  GUEST_PLACE_STATUSES,
  type GuestRefusal,
  hasPlace,
  refuseAccept,
  refuseDecline,
  refuseInvite,
  refuseLeave,
  refuseRemove,
} from './live-guest.policy.js';
import { LiveKitTokenService } from './live-kit-token.service.js';
import { LiveRecordingService } from './recording/live-recording.service.js';

// A ban of the Profile or of the whole account, or a suspension still
// running: a decision of staff.
function sanctionedByStaff(host: {
  isAccountBanned: boolean;
  suspendedUntil: Date | null;
  user: { isRootBanned: boolean } | null;
}): boolean {
  return (
    host.isAccountBanned ||
    !!host.user?.isRootBanned ||
    (!!host.suspendedUntil && host.suspendedUntil > new Date())
  );
}

const HOST_SHOWN_WHERE = (): Prisma.ProfileWhereInput => ({
  isAccountBanned: false,
  OR: [{ suspendedUntil: null }, { suspendedUntil: { lt: new Date() } }],
  user: { isActive: true, deactivatedAt: null },
});

// A live's guests with a place, as a live answers them: those on air first,
// in the order they went on air, then those invited, in the order invited.
const GUESTS_WITH_PLACE = {
  where: { status: { in: [...GUEST_PLACE_STATUSES] } },
  select: {
    profileId: true,
    status: true,
    profile: { select: { username: true, avatar: true } },
  },
  orderBy: [{ joinedAt: { sort: 'asc', nulls: 'last' } }, { invitedAt: 'asc' }],
} satisfies Prisma.LiveStream$guestsArgs;

interface GuestRow {
  profileId: string;
  status: LiveGuestStatus;
  profile: { username: string; avatar: string | null };
}

/** One guest of a live, as the app is answered and told of it. */
export interface LiveGuestView {
  profileId: string;
  username: string;
  avatar: string | null;
  status: LiveGuestStatus;
}

const guestView = (row: GuestRow): LiveGuestView => ({
  profileId: row.profileId,
  username: row.profile.username,
  avatar: row.profile.avatar,
  status: row.status,
});

const refused = (refusal: GuestRefusal): AppException => {
  switch (refusal.kind) {
    case 'NOT_FOUND':
      return AppException.NotFound(refusal.code, refusal.message);
    case 'CONFLICT':
      return AppException.Conflict(refusal.code, refusal.message);
    default:
      return AppException.Forbidden(refusal.code, refusal.message);
  }
};

const streamNotFound = () =>
  AppException.NotFound(ErrorCode.STREAM_NOT_FOUND, 'Stream not found');

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);
  /** Serializes concurrent stream-start operations per host. */
  private readonly startStreamInFlight = new Map<string, Promise<any>>();

  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private systemSettings: SystemSettingsService,
    private liveKitTokenService: LiveKitTokenService,
    private recording: LiveRecordingService,
  ) {}

  private mapStreamHost(
    profile: { id: string; username: string; avatar: string | null } | null,
  ) {
    if (!profile) return null;
    return {
      id: profile.id,
      profile: {
        username: profile.username,
        avatar: profile.avatar,
      },
    };
  }

  /**
   * A live's guests as a viewer is answered them: those on air, and to the
   * host of the live those invited too, as an invite is between the host
   * and the invitee. With the first guest on air in the shape of the one
   * co-host a live had: kept for the apps still installed that read
   * `coHostId` and `coHost`.
   */
  private guestsAnswer(rows: GuestRow[], toHost: boolean) {
    const guests = rows
      .filter((row) => toHost || row.status === 'ON_AIR')
      .map(guestView);
    const first = guests.find((guest) => guest.status === 'ON_AIR');
    return {
      guests,
      coHostId: first?.profileId ?? null,
      coHost: first
        ? this.mapStreamHost({
            id: first.profileId,
            username: first.username,
            avatar: first.avatar,
          })
        : null,
    };
  }

  // While staff have live streams switched off, nobody starts, joins or is
  // invited to be a guest of one.
  private async assertLiveEnabled() {
    const liveEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.LIVE_STREAMS_ENABLED,
    );
    if (!liveEnabled) {
      throw new ForbiddenException('LIVE_STREAMS_DISABLED');
    }
  }

  // The guests with a place in lives that ended are out of them.
  private async endGuests(
    client: Pick<PrismaService, 'liveGuest'>,
    streamIds: string[],
  ) {
    if (streamIds.length === 0) return;
    await client.liveGuest.updateMany({
      where: {
        streamId: { in: streamIds },
        status: { in: [...GUEST_PLACE_STATUSES] },
      },
      data: { status: 'LEFT', endedAt: new Date() },
    });
  }

  async startStream(
    hostProfileId: string,
    title?: string,
    audience: LiveAudience = DEFAULT_LIVE_AUDIENCE,
  ) {
    await this.assertLiveEnabled();

    // Serialize concurrent startStream calls per-host so that at most
    // one stream transition runs at a time for the same host.
    const inFlight = this.startStreamInFlight.get(hostProfileId);
    if (inFlight) {
      return inFlight;
    }

    const streamPromise = (async () => {
      try {
        // Atomic: terminate previous streams and create the new one in a single transaction.
        const stream = await this.prisma.$transaction(async (tx) => {
          const previous = await tx.liveStream.findMany({
            where: { hostId: hostProfileId, status: 'LIVE' },
            select: { id: true },
          });
          await tx.liveStream.updateMany({
            where: { hostId: hostProfileId, status: 'LIVE' },
            data: { status: 'ENDED', endedAt: new Date() },
          });
          await this.endGuests(
            tx,
            previous.map((stream) => stream.id),
          );

          return tx.liveStream.create({
            data: {
              hostId: hostProfileId,
              title,
              audience,
              status: 'LIVE',
            },
          });
        });

        const token = await this.liveKitTokenService.createToken(
          stream.id,
          hostProfileId,
          true,
        );
        // Not waited for: the host is on air whether or not the recorder
        // has started. A broadcast ended above has its recording stopped by
        // the recorder's check.
        // A practice is only for checking light, sound and connection: it
        // is not recorded.
        if (audience !== 'PRACTICE') {
          void this.recording.start(stream.id, hostProfileId);
        }
        return { stream, token };
      } finally {
        this.startStreamInFlight.delete(hostProfileId);
      }
    })();

    this.startStreamInFlight.set(hostProfileId, streamPromise);
    return streamPromise;
  }

  /**
   * A token to watch a live, for the Profile the person acts as: it is their
   * identity in the video room, the one a guest of theirs goes on air with
   * and the one a block takes out. A session with no Profile watches nothing,
   * and the host does not watch their own live: a second connection with
   * their identity would take the place of the one on air.
   */
  async getViewerToken(streamId: string, viewerProfileId: string) {
    await this.assertLiveEnabled();
    if (!viewerProfileId) {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found or ended',
      );
    }
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: { host: { select: HOST_SHOWN_SELECT } },
    });
    if (stream && stream.hostId === viewerProfileId) {
      throw AppException.Conflict(
        ErrorCode.ALREADY_ON_AIR,
        'The host is on air in this live',
      );
    }

    if (
      stream?.status !== 'LIVE' ||
      !hostShown(stream.host) ||
      (await isBlockedEitherWay(this.prisma, viewerProfileId, stream.hostId)) ||
      !(await canWatchStream(this.prisma, stream, viewerProfileId))
    ) {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found or ended',
      );
    }

    const token = await this.liveKitTokenService.createToken(
      stream.id,
      viewerProfileId,
      false,
    );
    return { token };
  }

  async endStream(hostProfileId: string) {
    const activeStreams = await this.prisma.liveStream.findMany({
      where: { hostId: hostProfileId, status: 'LIVE' },
    });

    // The replay is set once the recording is made into one, never here.
    for (const stream of activeStreams) {
      await this.prisma.liveStream.update({
        where: { id: stream.id },
        data: { status: 'ENDED', endedAt: new Date() },
      });
      await this.endGuests(this.prisma, [stream.id]);
      await this.recording.stop(stream.id);
    }

    return { success: true, endedCount: activeStreams.length };
  }

  // A Profile that may no longer be seen while on air (banned, suspended, or
  // its account closed or being deleted): as host, its broadcast ends at
  // once and its room is closed, so nobody still connected keeps watching; as
  // a guest, it is removed from every live where it is invited or on air,
  // which go on. The Profile's state is read, not the reason of the event,
  // so a session ended for any other reason (a password change) leaves the
  // broadcast alone. Only a staff sanction (a ban or a suspension) marks the
  // broadcast as ended by staff, which keeps its replay from the host; an
  // account closed or being deleted ends it as the host ending it would.
  @OnEvent('user.session.terminate', { async: true })
  async endBroadcastsOfSanctionedHost(
    event: UserSessionTerminateEvent['payload'],
  ) {
    const gone: Prisma.ProfileWhereInput =
      event.scope === 'profile' && event.profileId
        ? { id: event.profileId, NOT: HOST_SHOWN_WHERE() }
        : { userId: event.userId, NOT: HOST_SHOWN_WHERE() };
    try {
      const streams = await this.prisma.liveStream.findMany({
        where: { status: 'LIVE', host: gone },
        select: {
          id: true,
          host: {
            select: {
              isAccountBanned: true,
              suspendedUntil: true,
              user: { select: { isRootBanned: true } },
            },
          },
        },
      });
      // Each broadcast on its own: one that fails leaves the others to end.
      for (const stream of streams) {
        try {
          await this.prisma.liveStream.update({
            where: { id: stream.id },
            data: {
              status: 'ENDED',
              endedAt: new Date(),
              endedByStaff: sanctionedByStaff(stream.host),
            },
          });
          await this.endGuests(this.prisma, [stream.id]);
          await this.recording.stop(stream.id);
          await this.recording.closeRoom(stream.id);
        } catch (error: unknown) {
          this.logger.error(
            `Could not end broadcast ${stream.id} of a sanctioned host: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const places = await this.prisma.liveGuest.findMany({
        where: {
          status: { in: [...GUEST_PLACE_STATUSES] },
          profile: gone,
          stream: { status: 'LIVE' },
        },
        select: { streamId: true, profileId: true },
      });
      for (const place of places) {
        try {
          await this.takeGuestOff(
            place.streamId,
            place.profileId,
            'REMOVED',
            'disconnect',
          );
        } catch (error: unknown) {
          this.logger.error(
            `Could not take a sanctioned guest off broadcast ${place.streamId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        `Could not end the broadcasts of a sanctioned host: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Bounded, not paginated: concurrent live streams are
  // self-limiting in practice, unlike a growing social history, so a safety
  // cap is proportionate here rather than full cursor pagination.
  async getActiveStreams(viewerProfileId?: string) {
    const streams = await this.prisma.liveStream.findMany({
      // Hosts in a block relation with the viewer are hidden.
      where: {
        status: 'LIVE',
        host: {
          ...(await visibleToViewerWhere(this.prisma, viewerProfileId)),
          AND: [HOST_SHOWN_WHERE()],
        },
        // Who each live is for: a practice is never listed.
        AND: [
          listedForViewer(
            viewerProfileId,
            await getBlockedProfileIds(this.prisma, viewerProfileId),
          ),
        ],
      },
      include: {
        host: {
          select: { id: true, username: true, avatar: true },
        },
        guests: GUESTS_WITH_PLACE,
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    return streams.map(({ guests, ...stream }) => ({
      ...stream,
      host: this.mapStreamHost(stream.host),
      ...this.guestsAnswer(
        guests,
        !!viewerProfileId && stream.hostId === viewerProfileId,
      ),
    }));
  }

  async getStream(streamId: string, viewerProfileId?: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: {
        host: {
          select: {
            id: true,
            username: true,
            avatar: true,
            ...HOST_SHOWN_SELECT,
          },
        },
        guests: GUESTS_WITH_PLACE,
      },
    });

    if (
      !stream ||
      !hostShown(stream.host) ||
      (await isBlockedEitherWay(this.prisma, viewerProfileId, stream.hostId)) ||
      !(await canWatchStream(this.prisma, stream, viewerProfileId))
    )
      throw streamNotFound();

    const { guests, ...rest } = stream;
    return {
      ...rest,
      host: this.mapStreamHost(stream.host),
      ...this.guestsAnswer(
        guests,
        !!viewerProfileId && stream.hostId === viewerProfileId,
      ),
    };
  }

  /** A live's guests with a place, as the app is told of them. */
  async listGuests(streamId: string): Promise<LiveGuestView[]> {
    const rows = await this.prisma.liveGuest.findMany({
      where: { streamId, ...GUESTS_WITH_PLACE.where },
      select: GUESTS_WITH_PLACE.select,
      orderBy: GUESTS_WITH_PLACE.orderBy,
    });
    return rows.map(guestView);
  }

  // Everyone in the live's room is told who is on air with the host; the
  // host alone is told who is invited too, as an invite is between them and
  // the invitee.
  private async announceGuests(streamId: string): Promise<LiveGuestView[]> {
    const [guests, stream] = await Promise.all([
      this.listGuests(streamId),
      this.prisma.liveStream.findUnique({
        where: { id: streamId },
        select: { hostId: true },
      }),
    ]);
    this.gateway.server.to(`live:${streamId}`).emit('live:guests_changed', {
      streamId,
      guests: guests.filter((guest) => guest.status === 'ON_AIR'),
    });
    if (stream) {
      this.gateway.server
        .to(`user:${stream.hostId}`)
        .emit('live:guest_invites', { streamId, guests });
    }
    return guests;
  }

  // One guest's change at a time per live, so the count of places read is
  // the one written against.
  private lockStream(tx: Prisma.TransactionClient, streamId: string) {
    return tx.$queryRaw`SELECT id FROM "live_streams" WHERE id = ${streamId} FOR UPDATE`;
  }

  /**
   * Invites a Profile to be a guest of the host's live. A Profile who
   * declined, left or was removed may be invited again. Nobody already in
   * the live loses their place to an invite.
   */
  async inviteGuest(
    streamId: string,
    hostProfileId: string,
    invitee: { profileId: string } | { userId: string },
  ) {
    await this.assertLiveEnabled();
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { id: true, hostId: true, status: true, title: true },
    });
    if (!stream) throw streamNotFound();

    const [inviteeProfile, hostProfile] = await Promise.all([
      this.prisma.profile.findFirst({
        where:
          'profileId' in invitee
            ? { id: invitee.profileId }
            : { userId: invitee.userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, username: true },
      }),
      this.prisma.profile.findUnique({
        where: { id: hostProfileId },
        select: { id: true, username: true, avatar: true },
      }),
    ]);
    const blocked =
      !!inviteeProfile &&
      (await isBlockedEitherWay(this.prisma, hostProfileId, inviteeProfile.id));

    const inviteeId = await this.prisma.$transaction(async (tx) => {
      await this.lockStream(tx, streamId);
      const [current, guests] = await Promise.all([
        tx.liveStream.findUnique({
          where: { id: streamId },
          select: { hostId: true, status: true },
        }),
        tx.liveGuest.findMany({
          where: { streamId },
          select: { profileId: true, status: true },
        }),
      ]);
      const profileId = inviteeProfile?.id ?? null;
      const refusal = refuseInvite({
        stream: current ?? stream,
        callerId: hostProfileId,
        inviteeId: profileId,
        blocked,
        inviteeStatus:
          guests.find((guest) => guest.profileId === profileId)?.status ?? null,
        withPlace: guests.filter((guest) => hasPlace(guest.status)).length,
      });
      if (refusal || profileId === null) {
        throw refused(refusal as GuestRefusal);
      }
      const invitedAt = new Date();
      // A row of a guest who declined, left or was removed is used again.
      await tx.liveGuest.upsert({
        where: { streamId_profileId: { streamId, profileId } },
        create: { streamId, profileId, status: 'INVITED', invitedAt },
        update: {
          status: 'INVITED',
          invitedAt,
          joinedAt: null,
          endedAt: null,
        },
      });
      return profileId;
    });

    const host = {
      id: hostProfile?.id,
      username: hostProfile?.username,
      avatar: hostProfile?.avatar,
    };
    this.gateway.server.to(`user:${inviteeId}`).emit('live:guest_invite', {
      streamId,
      streamTitle: stream.title,
      host,
    });
    // Kept for the apps still installed that answer the invite of a
    // co-host.
    this.gateway.server.to(`user:${inviteeId}`).emit('live:cohost_invite', {
      streamId,
      streamTitle: stream.title,
      host,
    });
    await this.announceGuests(streamId);

    this.logger.log(
      `Profile ${inviteeId} invited as a guest of stream ${streamId}`,
    );
    return {
      success: true,
      profileId: inviteeId,
      guests: await this.listGuests(streamId),
    };
  }

  /**
   * The invited Profile goes on air: answered with a token that may publish
   * video and sound, and recorded as a part of its own. A guest already on
   * air asks again for a token to rejoin, and nothing else changes.
   */
  async acceptGuestInvite(streamId: string, profileId: string) {
    await this.assertLiveEnabled();
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { hostId: true, status: true },
    });
    if (!stream) throw streamNotFound();
    const blocked = await isBlockedEitherWay(
      this.prisma,
      stream.hostId,
      profileId,
    );

    const wentOnAir = await this.prisma.$transaction(async (tx) => {
      await this.lockStream(tx, streamId);
      const [current, guests] = await Promise.all([
        tx.liveStream.findUnique({
          where: { id: streamId },
          select: { hostId: true, status: true },
        }),
        tx.liveGuest.findMany({
          where: { streamId },
          select: { profileId: true, status: true },
        }),
      ]);
      const status =
        guests.find((guest) => guest.profileId === profileId)?.status ?? null;
      const refusal = refuseAccept({
        stream: current ?? stream,
        guestStatus: status,
        blocked,
        onAir: guests.filter((guest) => guest.status === 'ON_AIR').length,
      });
      if (refusal) throw refused(refusal);
      if (status === 'ON_AIR') return false;
      // Only from the invite read: one removed or declined meanwhile is not
      // put on air, and gets no token.
      const { count } = await tx.liveGuest.updateMany({
        where: { streamId, profileId, status: 'INVITED' },
        data: { status: 'ON_AIR', joinedAt: new Date(), endedAt: null },
      });
      if (count === 0) throw refused(refuseDecline(null) as GuestRefusal);
      return true;
    });

    const token = await this.liveKitTokenService.createToken(
      streamId,
      profileId,
      true,
    );

    // Not waited for: the guest is on air whether or not the recorder has
    // started. One already recorded is not recorded twice.
    void this.recording.startCoHost(streamId, profileId);

    if (wentOnAir) {
      await this.hideFromBlocked(streamId, stream.hostId, profileId);
      const profile = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { username: true },
      });
      // Kept for the apps still installed that show one co-host.
      this.gateway.server.to(`live:${streamId}`).emit('live:cohost_joined', {
        coHostId: profileId,
        coHostUsername: profile?.username,
      });
      await this.announceGuests(streamId);
      this.logger.log(`Profile ${profileId} went on air in stream ${streamId}`);
    }

    return { token, streamId };
  }

  /**
   * A guest just went on air: the live is hidden from every Profile in a
   * block with them, whoever blocked whom, while they are on air. Each one
   * is told the live is unavailable, so an app watching it closes it, and is
   * taken out of the video room by the identity of their watching token
   * (the Profile's id, so another Profile of the same person stays). The
   * host and the live's other guests are left
   * alone, and the host is not told. Never throws: going on air does not
   * wait on it.
   */
  private async hideFromBlocked(
    streamId: string,
    hostId: string,
    guestProfileId: string,
  ) {
    try {
      const blocked = await getBlockedProfileIds(this.prisma, guestProfileId);
      if (blocked.length === 0) return;
      const guests = await this.prisma.liveGuest.findMany({
        where: { streamId, status: { in: [...GUEST_PLACE_STATUSES] } },
        select: { profileId: true },
      });
      const inLive = new Set([hostId, ...guests.map((g) => g.profileId)]);
      for (const viewer of blocked) {
        if (inLive.has(viewer)) continue;
        this.gateway.server
          .to(`user:${viewer}`)
          .emit('live:unavailable', { streamId });
        await this.recording.removeFromRoom(streamId, viewer);
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Could not hide stream ${streamId} from those in a block with a guest: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** The invited Profile says no; the host may invite them again. */
  async declineGuestInvite(streamId: string, profileId: string) {
    const guest = await this.prisma.liveGuest.findUnique({
      where: { streamId_profileId: { streamId, profileId } },
      select: { status: true },
    });
    const refusal = refuseDecline(guest?.status ?? null);
    if (refusal) throw refused(refusal);
    const { count } = await this.prisma.liveGuest.updateMany({
      where: { streamId, profileId, status: 'INVITED' },
      data: { status: 'DECLINED', endedAt: new Date() },
    });
    // Answered or removed meanwhile.
    if (count === 0) throw refused(refuseDecline(null) as GuestRefusal);
    await this.announceGuests(streamId);
    return { success: true };
  }

  /** A guest on air leaves the live, which goes on for the others. */
  async leaveAsGuest(streamId: string, profileId: string) {
    const guest = await this.prisma.liveGuest.findUnique({
      where: { streamId_profileId: { streamId, profileId } },
      select: { status: true },
    });
    const refusal = refuseLeave(guest?.status ?? null);
    if (refusal) throw refused(refusal);
    if (!(await this.takeGuestOff(streamId, profileId, 'LEFT'))) {
      throw refused(refuseLeave(null) as GuestRefusal);
    }
    return { success: true };
  }

  /** The host removes one guest, invited or on air. */
  async removeGuest(
    streamId: string,
    hostProfileId: string,
    guestProfileId: string,
  ) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { hostId: true },
    });
    if (!stream) throw streamNotFound();
    const guest = await this.prisma.liveGuest.findUnique({
      where: {
        streamId_profileId: { streamId, profileId: guestProfileId },
      },
      select: { status: true },
    });
    const refusal = refuseRemove({
      stream,
      callerId: hostProfileId,
      guestStatus: guest?.status ?? null,
    });
    if (refusal) throw refused(refusal);
    if (!(await this.takeGuestOff(streamId, guestProfileId, 'REMOVED'))) {
      throw refused(
        refuseRemove({
          stream,
          callerId: hostProfileId,
          guestStatus: null,
        }) as GuestRefusal,
      );
    }
    this.logger.log(`Guest removed from stream ${streamId}`);
    return { success: true };
  }

  /**
   * The host removes every guest invited or on air: what removing the one
   * co-host did, kept for the apps still installed with it.
   */
  async removeAllGuests(streamId: string, hostProfileId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: { hostId: true },
    });
    if (!stream) throw streamNotFound();
    if (!isStreamHost(stream, hostProfileId))
      throw AppException.Forbidden(
        ErrorCode.ONLY_HOST_CAN_REMOVE,
        'Only the host can remove a guest',
      );
    const guests = await this.prisma.liveGuest.findMany({
      where: { streamId, status: { in: [...GUEST_PLACE_STATUSES] } },
      select: { profileId: true },
    });
    for (const guest of guests) {
      await this.takeGuestOff(streamId, guest.profileId, 'REMOVED');
    }
    this.logger.log(`Guests removed from stream ${streamId}`);
    return { success: true };
  }

  /**
   * Takes a guest with a place out of a live, as leaving or removed. One on
   * air has their recording part stopped and is taken out of the video
   * room; the live goes on for the others. Only from the state read: a
   * guest who changed meanwhile is left as they are, and false answered.
   *
   * A guest who leaves or is removed by the host goes back to watching with
   * the same identity, so they are not disconnected: their publishing is
   * revoked, which takes their camera and microphone off for everyone and
   * leaves alone a watching connection that may already have replaced the
   * one on air. A sanctioned guest is disconnected.
   */
  private async takeGuestOff(
    streamId: string,
    profileId: string,
    to: Extract<LiveGuestStatus, 'LEFT' | 'REMOVED'>,
    room: 'keep-watching' | 'disconnect' = 'keep-watching',
  ): Promise<boolean> {
    // Under the live's lock, as invite and accept are: a guest is never put
    // on air and taken off at the same moment.
    const was = await this.prisma.$transaction(async (tx) => {
      await this.lockStream(tx, streamId);
      const guest = await tx.liveGuest.findUnique({
        where: { streamId_profileId: { streamId, profileId } },
        select: { status: true },
      });
      if (!guest || !hasPlace(guest.status)) return null;
      const { count } = await tx.liveGuest.updateMany({
        where: { streamId, profileId, status: guest.status },
        data: { status: to, endedAt: new Date() },
      });
      return count === 0 ? null : guest.status;
    });
    if (was === null) return false;

    if (to === 'REMOVED') {
      // The app is told first, so it goes back to watching instead of
      // taking the disconnection that follows for a lost connection.
      this.gateway.server
        .to(`user:${profileId}`)
        .emit('live:guest_removed', { streamId });
      // Kept for the apps still installed that know one co-host.
      this.gateway.server
        .to(`user:${profileId}`)
        .emit('live:cohost_removed', { streamId });
    }
    if (was === 'ON_AIR') {
      await this.recording.stopCoHost(streamId, profileId);
      // Done by the live service too, so their camera stops for everyone
      // even if their app does not react.
      if (room === 'disconnect') {
        await this.recording.removeFromRoom(streamId, profileId);
      } else {
        await this.recording.stopPublishing(streamId, profileId);
      }
    }
    const guests = await this.announceGuests(streamId);
    if (was === 'ON_AIR') {
      // Kept for the apps still installed that show one co-host: the
      // co-host leaves only when nobody is on air any more; otherwise the
      // first guest still on air is shown as the co-host.
      const first = guests.find((guest) => guest.status === 'ON_AIR');
      const room = this.gateway.server.to(`live:${streamId}`);
      if (first) {
        room.emit('live:cohost_joined', {
          coHostId: first.profileId,
          coHostUsername: first.username,
        });
      } else {
        room.emit('live:cohost_left', { coHostId: profileId });
      }
    }
    return true;
  }
}
