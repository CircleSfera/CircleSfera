import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { AppGateway } from '../socket/app.gateway.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private gateway: AppGateway,
  ) {}

  async startStream(userId: string, title?: string) {
    // End any existing streams for this user
    await this.prisma.liveStream.updateMany({
      where: { hostId: userId, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    const stream = await this.prisma.liveStream.create({
      data: {
        hostId: userId,
        title,
        status: 'LIVE',
      },
    });

    const token = await this.createToken(stream.id, userId, true);
    return { stream, token };
  }

  async getViewerToken(streamId: string, userId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (stream?.status !== 'LIVE') {
      throw new NotFoundException('Stream not found or ended');
    }

    const token = await this.createToken(stream.id, userId, false);
    return { token };
  }

  async endStream(userId: string) {
    const activeStreams = await this.prisma.liveStream.findMany({
      where: { hostId: userId, status: 'LIVE' },
    });

    if (activeStreams.length > 0) {
      await Promise.all(
        activeStreams.map((stream) =>
          this.prisma.liveStream.update({
            where: { id: stream.id },
            data: {
              status: 'ENDED',
              endedAt: new Date(),
              replayUrl:
                stream.hlsUrl ||
                `https://cdn.circlesfera.com/vod/replays/${stream.id}.m3u8`,
            },
          }),
        ),
      );
    }

    return { success: true, endedCount: activeStreams.length };
  }

  async getActiveStreams() {
    return this.prisma.liveStream.findMany({
      where: { status: 'LIVE' },
      include: {
        host: {
          include: { profile: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Returns stream info including host and co-host profiles. */
  async getStream(streamId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: {
        host: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
        coHost: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });

    if (!stream) throw new NotFoundException('Stream not found');
    return stream;
  }

  /**
   * Host invites a viewer as co-host.
   * Updates coHostId in DB and signals the invitee via Socket.io.
   */
  async inviteCoHost(streamId: string, hostId: string, coHostUserId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.hostId !== hostId)
      throw new ForbiddenException('Only the host can invite a co-host');
    if (stream.status !== 'LIVE')
      throw new NotFoundException('Stream is not active');
    if (coHostUserId === hostId)
      throw new ForbiddenException('Cannot invite yourself as co-host');

    const [invitee, host] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: coHostUserId },
        select: { id: true, profile: { select: { username: true } } },
      }),
      this.prisma.user.findUnique({
        where: { id: hostId },
        select: {
          id: true,
          profile: { select: { username: true, avatar: true } },
        },
      }),
    ]);

    if (!invitee) throw new NotFoundException('Invited user not found');

    await this.prisma.liveStream.update({
      where: { id: streamId },
      data: { coHostId: coHostUserId },
    });

    // Signal the invitee through their personal socket room
    this.gateway.server.to(`user:${coHostUserId}`).emit('live:cohost_invite', {
      streamId,
      streamTitle: stream.title,
      host: {
        id: host?.id,
        username: host?.profile?.username,
        avatar: host?.profile?.avatar,
      },
    });

    // Notify the stream room
    this.gateway.server.to(`live:${streamId}`).emit('live:cohost_joined', {
      coHostId: coHostUserId,
      coHostUsername: invitee.profile?.username,
    });

    this.logger.log(
      `User ${coHostUserId} invited as co-host for stream ${streamId}`,
    );

    return { success: true, coHostId: coHostUserId };
  }

  /**
   * Invitee accepts the co-host invite.
   * Returns a LiveKit token with canPublish: true.
   */
  async acceptCoHostInvite(streamId: string, userId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.status !== 'LIVE')
      throw new NotFoundException('Stream is not active');
    if (stream.coHostId !== userId)
      throw new ForbiddenException(
        'You are not the invited co-host for this stream',
      );

    const token = await this.createToken(streamId, userId, true);

    this.logger.log(
      `User ${userId} accepted co-host role for stream ${streamId}`,
    );

    return { token, streamId };
  }

  /**
   * Host removes the current co-host.
   */
  async removeCoHost(streamId: string, hostId: string) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });

    if (!stream) throw new NotFoundException('Stream not found');
    if (stream.hostId !== hostId)
      throw new ForbiddenException('Only the host can remove a co-host');

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

  async sendGift(
    streamId: string,
    userId: string,
    giftId: string,
    price: number,
  ) {
    const [stream, user] = await Promise.all([
      this.prisma.liveStream.findUnique({
        where: { id: streamId },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, profile: { select: { username: true } } },
      }),
    ]);

    if (stream?.status !== 'LIVE') {
      throw new NotFoundException('Live stream not active');
    }

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      streamId,
      senderId: user.id,
      senderUsername: user.profile?.username,
      giftId,
      price,
      sentAt: new Date().toISOString(),
    };
  }

  private async createToken(
    roomName: string,
    participantName: string,
    isHost: boolean,
  ) {
    const apiKey =
      this.configService.get<string>('LIVEKIT_API_KEY') || 'devkey';
    const apiSecret =
      this.configService.get<string>('LIVEKIT_API_SECRET') || 'secret';

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isHost,
      canSubscribe: true,
    });

    return await at.toJwt();
  }
}

