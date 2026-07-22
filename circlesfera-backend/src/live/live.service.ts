import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LiveService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
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
    await this.prisma.liveStream.updateMany({
      where: { hostId: userId, status: 'LIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    return { success: true };
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

  async sendGift(
    streamId: string,
    _userId: string,
    giftId: string,
    price: number,
  ) {
    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
    });
    if (stream?.status !== 'LIVE') {
      throw new NotFoundException('Live stream not active');
    }
    return {
      success: true,
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
