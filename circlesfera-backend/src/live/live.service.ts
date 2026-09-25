import { ErrorCode } from '@circlesfera/shared';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { isStreamCoHost, isStreamHost } from './live-authorization.js';
import { LiveKitTokenService } from './live-kit-token.service.js';

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

  async startStream(hostProfileId: string, title?: string) {
    const liveEnabled = await this.systemSettings.isEnabled(
      SYSTEM_SETTING_KEYS.LIVE_STREAMS_ENABLED,
    );
    if (!liveEnabled) {
      throw new ForbiddenException('LIVE_STREAMS_DISABLED');
    }

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
          await tx.liveStream.updateMany({
            where: { hostId: hostProfileId, status: 'LIVE' },
            data: { status: 'ENDED', endedAt: new Date() },
          });

          return tx.liveStream.create({
            data: {
              hostId: hostProfileId,
              title,
              status: 'LIVE',
            },
          });
        });

        const token = await this.liveKitTokenService.createToken(
          stream.id,
          hostProfileId,
          true,
        );
        return { stream, token };
      } finally {
        this.startStreamInFlight.delete(hostProfileId);
      }
    })();

    this.startStreamInFlight.set(hostProfileId, streamPromise);
    return streamPromise;
  }

  async getViewerToken(streamId: string, userId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (stream?.status !== 'LIVE') {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found or ended',
      );
    }

    const token = await this.liveKitTokenService.createToken(
      stream.id,
      userId,
      false,
    );
    return { token };
  }

  async endStream(hostProfileId: string) {
    const activeStreams = await this.prisma.liveStream.findMany({
      where: { hostId: hostProfileId, status: 'LIVE' },
    });

    if (activeStreams.length > 0) {
      await Promise.all(
        activeStreams.map((stream) =>
          this.prisma.liveStream.update({
            where: { id: stream.id },
            data: {
              status: 'ENDED',
              endedAt: new Date(),
              // Prefer recorded HLS; never invent a CDN URL that does not exist.
              replayUrl: stream.hlsUrl ?? null,
            },
          }),
        ),
      );
    }

    return { success: true, endedCount: activeStreams.length };
  }

  // Bounded, not paginated (DATA-003): concurrent live streams are
  // self-limiting in practice, unlike a growing social history, so a safety
  // cap is proportionate here rather than full cursor pagination.
  async getActiveStreams() {
    const streams = await this.prisma.liveStream.findMany({
      where: { status: 'LIVE' },
      include: {
        host: {
          select: { id: true, username: true, avatar: true },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 200,
    });

    return streams.map((stream) => ({
      ...stream,
      host: this.mapStreamHost(stream.host),
    }));
  }

  async getStream(streamId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: {
        host: {
          select: { id: true, username: true, avatar: true },
        },
        coHost: {
          select: { id: true, username: true, avatar: true },
        },
      },
    });

    if (!stream)
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );

    return {
      ...stream,
      host: this.mapStreamHost(stream.host),
      coHost: stream.coHost ? this.mapStreamHost(stream.coHost) : null,
    };
  }

  async inviteCoHost(
    streamId: string,
    hostProfileId: string,
    coHostUserId: string,
  ) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream)
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );
    if (!isStreamHost(stream, hostProfileId))
      throw AppException.Forbidden(
        ErrorCode.ONLY_HOST_CAN_INVITE,
        'Only the host can invite a co-host',
      );
    if (stream.status !== 'LIVE')
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_ACTIVE,
        'Stream is not active',
      );

    const [inviteeProfile, hostProfile] = await Promise.all([
      this.prisma.profile.findFirst({
        where: { userId: coHostUserId },
        select: { id: true, username: true, userId: true },
      }),
      this.prisma.profile.findUnique({
        where: { id: hostProfileId },
        select: { id: true, username: true, avatar: true },
      }),
    ]);

    if (!inviteeProfile)
      throw AppException.NotFound(
        ErrorCode.USER_NOT_FOUND,
        'Invited user not found',
      );
    if (inviteeProfile.id === hostProfileId)
      throw AppException.Forbidden(
        ErrorCode.CANNOT_INVITE_SELF,
        'Cannot invite yourself as co-host',
      );

    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { coHostId: inviteeProfile.id },
    });

    this.gateway.server
      .to(`user:${inviteeProfile.id}`)
      .emit('live:cohost_invite', {
        streamId,
        streamTitle: stream.title,
        host: {
          id: hostProfile?.id,
          username: hostProfile?.username,
          avatar: hostProfile?.avatar,
        },
      });

    this.gateway.server.to(`live:${streamId}`).emit('live:cohost_joined', {
      coHostId: inviteeProfile.id,
      coHostUsername: inviteeProfile.username,
    });

    this.logger.log(
      `Profile ${inviteeProfile.id} invited as co-host for stream ${streamId}`,
    );

    return { success: true, coHostId: inviteeProfile.id };
  }

  async acceptCoHostInvite(streamId: string, profileId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream)
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );
    if (stream.status !== 'LIVE')
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_ACTIVE,
        'Stream is not active',
      );
    if (!isStreamCoHost(stream, profileId))
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You are not the invited co-host for this stream',
      );

    const token = await this.liveKitTokenService.createToken(
      streamId,
      profileId,
      true,
    );

    this.logger.log(
      `Profile ${profileId} accepted co-host role for stream ${streamId}`,
    );

    return { token, streamId };
  }

  async removeCoHost(streamId: string, hostProfileId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream)
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_FOUND,
        'Stream not found',
      );
    if (!isStreamHost(stream, hostProfileId))
      throw AppException.Forbidden(
        ErrorCode.ONLY_HOST_CAN_REMOVE,
        'Only the host can remove a co-host',
      );

    const removedCoHostId = stream.coHostId;

    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { coHostId: null },
    });

    if (removedCoHostId) {
      this.gateway.server
        .to(`user:${removedCoHostId}`)
        .emit('live:cohost_removed', { streamId });
      this.gateway.server
        .to(`live:${streamId}`)
        .emit('live:cohost_left', { coHostId: removedCoHostId });
    }

    this.logger.log(`Co-host removed from stream ${streamId}`);
    return { success: true };
  }
}
