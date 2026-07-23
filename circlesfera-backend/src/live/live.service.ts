import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { StripeService } from '../common/stripe/stripe.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway } from '../socket/app.gateway.js';
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
  ) {}

  async startStream(userId: string, title?: string) {
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
      if (!stream || stream.viewerCount <= 0) return 0;

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

    this.gateway.server.to(`user:${coHostUserId}`).emit('live:cohost_invite', {
      streamId,
      streamTitle: stream.title,
      host: {
        id: host?.id,
        username: host?.profile?.username,
        avatar: host?.profile?.avatar,
      },
    });

    this.gateway.server.to(`live:${streamId}`).emit('live:cohost_joined', {
      coHostId: coHostUserId,
      coHostUsername: invitee.profile?.username,
    });

    this.logger.log(
      `User ${coHostUserId} invited as co-host for stream ${streamId}`,
    );

    return { success: true, coHostId: coHostUserId };
  }

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
            email: true,
            stripeConnectAccountId: true,
            profile: { select: { username: true } },
          },
        },
      },
    });

    if (!stream || stream.status !== 'LIVE') {
      throw new NotFoundException('Live stream not active');
    }

    if (stream.hostId === senderId) {
      throw new BadRequestException('You cannot gift yourself');
    }

    if (!stream.host.stripeConnectAccountId) {
      throw new BadRequestException(
        'Host cannot receive gifts yet (no Stripe Connect account)',
      );
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: {
        id: true,
        email: true,
        profile: { select: { username: true } },
      },
    });
    if (!sender) throw new NotFoundException('User not found');

    const platformFee = Math.floor(amountCents * 0.2);
    const giftName = LIVE_GIFT_CATALOG[giftId].name;

    const pendingGift = await this.prisma.liveGift.create({
      data: {
        streamId,
        senderId,
        receiverId: stream.hostId,
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
                description: `Gift for @${stream.host.profile?.username || 'creator'}`,
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: platformFee,
          transfer_data: {
            destination: stream.host.stripeConnectAccountId,
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
          select: { profile: { select: { username: true, avatar: true } } },
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
            increment: Math.floor(params.amountCents * 0.8),
          },
        },
        create: {
          userId: params.creatorId,
          lifetimeEarningsCents: Math.floor(params.amountCents * 0.8),
        },
      });

      return gift;
    });

    this.gateway.server.to(`live:${params.streamId}`).emit('live:gift', {
      streamId: params.streamId,
      giftId: params.giftId,
      amountCents: params.amountCents,
      senderId: params.senderId,
      senderUsername: existing.sender.profile?.username,
      senderAvatar: existing.sender.profile?.avatar,
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
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');
    const isProd = this.configService.get('NODE_ENV') === 'production';

    if (!apiKey || !apiSecret) {
      if (isProd) {
        throw new Error(
          'SECURITY ALERT: LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required in production.',
        );
      }
      this.logger.warn(
        'LIVEKIT_API_KEY/SECRET missing — using ephemeral unsigned-unsafe tokens only allowed outside production',
      );
      throw new BadRequestException(
        'Live streaming is not configured (missing LiveKit credentials)',
      );
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
