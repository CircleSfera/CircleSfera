import { ErrorCode } from '@circlesfera/shared';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { AccessToken } from 'livekit-server-sdk';
import {
  CREATOR_SHARE_DECIMAL,
  PLATFORM_FEE_DECIMAL,
} from '../common/constants/monetization.constants.js';
import { AppException } from '../common/errors/app.exception.js';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { SYSTEM_SETTING_KEYS } from '../system-settings/system-settings.constants.js';
import { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { LIVE_GIFT_CATALOG, resolveGiftAmountCents } from './gift-catalog.js';

function appendCheckoutQuery(returnUrl: string, query: string): string {
  const sep = returnUrl.includes('?') ? '&' : '?';
  return `${returnUrl}${sep}${query}`;
}

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private gateway: AppGateway,
    private stripeService: StripeService,
    private systemSettings: SystemSettingsService,
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

    await this.prisma.liveStream.updateMany({
      where: { hostId: hostProfileId, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    const stream = await this.prisma.liveStream.create({
      data: {
        hostId: hostProfileId,
        title,
        status: 'LIVE',
      },
    });

    const token = await this.createToken(stream.id, hostProfileId, true);
    return { stream, token };
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

    const token = await this.createToken(stream.id, userId, false);
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

  async getActiveStreams() {
    const streams = await this.prisma.liveStream.findMany({
      where: { status: 'LIVE' },
      include: {
        host: {
          select: { id: true, username: true, avatar: true },
        },
      },
      orderBy: { startedAt: 'desc' },
    });

    return streams.map((stream) => ({
      ...stream,
      host: this.mapStreamHost(stream.host),
    }));
  }

  async incrementViewerCount(streamId: string): Promise<number> {
    try {
      const updated = await this.prisma.liveStream.update({
        where: { id: streamId },
        data: { viewerCount: { increment: 1 } },
        select: { viewerCount: true },
      });
      return updated.viewerCount;
    } catch (_err) {
      return 1;
    }
  }

  async decrementViewerCount(streamId: string): Promise<number> {
    try {
      const stream = await this.prisma.liveStream.findUnique({
        where: { id: streamId },
        select: { viewerCount: true },
      });
      if ((stream?.viewerCount ?? 0) <= 0) return 0;

      const updated = await this.prisma.liveStream.update({
        where: { id: streamId },
        data: { viewerCount: { decrement: 1 } },
        select: { viewerCount: true },
      });
      return Math.max(0, updated.viewerCount);
    } catch (_err) {
      return 0;
    }
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
    if (stream.hostId !== hostProfileId)
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
    if (stream.coHostId !== profileId)
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You are not the invited co-host for this stream',
      );

    const token = await this.createToken(streamId, profileId, true);

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
    if (stream.hostId !== hostProfileId)
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

  /**
   * Create a Stripe Checkout session for a live gift.
   * Price is resolved from the server-side catalog (client price ignored).
   */
  async sendGift(
    streamId: string,
    senderId: string,
    giftId: string,
    returnUrl: string,
    idempotencyKey?: string,
  ) {
    const amountCents = resolveGiftAmountCents(giftId);
    if (amountCents === null) {
      throw new BadRequestException(
        `Unknown giftId. Allowed: ${Object.keys(LIVE_GIFT_CATALOG).join(', ')}`,
      );
    }

    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      include: {
        host: {
          select: {
            id: true,
            userId: true,
            username: true,
            user: {
              select: {
                email: true,
                stripeConnectAccountId: true,
              },
            },
          },
        },
      },
    });

    if (stream?.status !== 'LIVE') {
      throw AppException.NotFound(
        ErrorCode.STREAM_NOT_ACTIVE,
        'Live stream not active',
      );
    }

    if (stream.host.userId === senderId) {
      throw AppException.BadRequest(
        ErrorCode.CANNOT_GIFT_SELF,
        'You cannot gift yourself',
      );
    }

    if (!stream.host.user?.stripeConnectAccountId) {
      throw new BadRequestException(
        'Host cannot receive gifts yet (no Stripe Connect account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        id: true,
        email: true,
        profiles: { select: { username: true } },
      },
    });
    if (!sender)
      throw AppException.NotFound(ErrorCode.USER_NOT_FOUND, 'User not found');

    const platformFee = Math.floor(amountCents * PLATFORM_FEE_DECIMAL);
    const giftName = LIVE_GIFT_CATALOG[giftId].name;

    const pendingGift = await this.prisma.liveGift.create({
      data: {
        streamId,
        senderId,
        receiverId: stream.host.userId,
        giftId,
        amountCents,
        currency: 'EUR',
        status: 'PENDING',
      },
    });

    const session = await this.stripeService.createCheckoutSession(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: sender.email,
        client_reference_id: senderId,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: `Live Gift: ${giftName}`,
                description: `Gift for @${stream.host.username || 'creator'}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: stream.host.user?.stripeConnectAccountId,
          },
        },
        metadata: {
          type: 'DIRECT_LIVE_GIFT',
          liveGiftId: pendingGift.id,
          streamId,
          giftId,
          creatorId: stream.hostId,
        },
        success_url: appendCheckoutQuery(
          returnUrl,
          'gift_success=true&session_id={CHECKOUT_SESSION_ID}',
        ),
        cancel_url: appendCheckoutQuery(returnUrl, 'gift_canceled=true'),
      },
      { idempotencyKey },
    );

    await this.prisma.liveGift.update({
      where: { id: pendingGift.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return {
      url: session.url,
      liveGiftId: pendingGift.id,
      giftId,
      amountCents,
    };
  }

  /**
   * Called from Stripe webhook after successful payment.
   * Persists ledger rows, updates earnings, broadcasts to the live room.
   */
  @OnEvent('payment.live_gift_completed')
  async handleLiveGiftPayment(payload: {
    liveGiftId: string;
    senderId: string;
    streamId: string;
    giftId: string;
    creatorId: string;
    amountCents: number;
    currency: string;
    paymentIntentId: string;
  }) {
    this.logger.log(
      `Received payment.live_gift_completed for ${payload.liveGiftId}`,
    );
    await this.completeGiftPayment(payload);
  }

  async completeGiftPayment(params: {
    liveGiftId: string;
    senderId: string;
    streamId: string;
    giftId: string;
    creatorId: string;
    amountCents: number;
    currency: string;
    paymentIntentId: string | null;
  }) {
    const existing = await this.prisma.liveGift.findUnique({
      where: { id: params.liveGiftId },
      include: {
        sender: {
          select: { profiles: { select: { username: true, avatar: true } } },
        },
      },
    });

    if (!existing) {
      this.logger.warn(`LiveGift ${params.liveGiftId} not found for webhook`);
      return;
    }

    if (existing.status === 'COMPLETED') {
      return; // idempotent
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'DIRECT_LIVE_GIFT',
          amount: params.amountCents,
          currency: params.currency.toUpperCase(),
          senderId: params.senderId,
          receiverId: params.creatorId,
          liveStreamId: params.streamId,
          stripePaymentIntentId: params.paymentIntentId,
          status: 'COMPLETED',
          description: `Live gift ${params.giftId} on stream ${params.streamId}`,
        },
      });

      const gift = await tx.liveGift.update({
        where: { id: params.liveGiftId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          transactionId: transaction.id,
          amountCents: params.amountCents,
        },
      });

      await tx.monetization.upsert({
        where: { userId: params.creatorId },
        update: {
          lifetimeEarningsCents: {
            increment: Math.floor(params.amountCents * CREATOR_SHARE_DECIMAL),
          },
        },
        create: {
          userId: params.creatorId,
          lifetimeEarningsCents: Math.floor(
            params.amountCents * CREATOR_SHARE_DECIMAL,
          ),
        },
      });

      return gift;
    });

    this.gateway.server.to(`live:${params.streamId}`).emit('live:gift', {
      streamId: params.streamId,
      giftId: params.giftId,
      amountCents: params.amountCents,
      senderId: params.senderId,
      senderUsername: existing.sender.profiles[0]?.username,
      senderAvatar: existing.sender.profiles[0]?.avatar,
      receiverId: params.creatorId,
      liveGiftId: result.id,
      sentAt: new Date().toISOString(),
    });

    this.logger.log(
      `Live gift ${params.liveGiftId} completed on stream ${params.streamId}`,
    );
  }

  private async createToken(
    roomName: string,
    participantName: string,
    isHost: boolean,
  ) {
    const isProd = this.configService.get('NODE_ENV') === 'production';
    const apiKey =
      this.configService.get<string>('LIVEKIT_API_KEY') ||
      (isProd ? '' : 'devkey');
    const apiSecret =
      this.configService.get<string>('LIVEKIT_API_SECRET') ||
      (isProd ? '' : 'secret');

    if (!apiKey || !apiSecret) {
      if (isProd) {
        throw new Error(
          'SECURITY ALERT: LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production.',
        );
      }
    }

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
