import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type WebhookEvent, WebhookReceiver } from 'livekit-server-sdk';
import { isBlockedEitherWay } from '../common/policies/block.policy.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { canWatchStream, type StreamAudienceFields } from './live-audience.js';
import { LiveRecordingService } from './recording/live-recording.service.js';

/** The events of the live service that can let someone in the room. */
const ENTRY_EVENTS: ReadonlySet<string> = new Set([
  'participant_joined',
  'track_published',
]);

/**
 * Keeps a live's video room to those allowed in it, as the live service
 * tells of each arrival. A join token stays valid for minutes, so someone
 * taken off the air, or from whom the live was hidden, could come back with
 * the token they already hold:
 * - one who may publish but is neither the host nor a guest on air keeps
 *   watching, without the right to publish;
 * - one in a block with the host or a guest on air, or who may no longer
 *   watch the live's audience, is taken out of the room.
 */
@Injectable()
export class LiveRoomWebhookService {
  private readonly logger = new Logger(LiveRoomWebhookService.name);
  private receiver?: WebhookReceiver;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly recording: LiveRecordingService,
  ) {}

  // The live service signs each event with the same key and secret the
  // backend uses to call it.
  private webhookReceiver(): WebhookReceiver {
    if (!this.receiver) {
      const key = this.config.get<string>('LIVEKIT_API_KEY');
      const secret = this.config.get<string>('LIVEKIT_API_SECRET');
      if (!key || !secret) {
        throw new UnauthorizedException('Live events are not configured');
      }
      this.receiver = new WebhookReceiver(key, secret);
    }
    return this.receiver;
  }

  /**
   * Reads an event the live service sent, checking its signature against
   * the exact bytes received, and acts on it. One not signed is refused.
   */
  async receive(rawBody: Buffer, authorization?: string): Promise<void> {
    let event: WebhookEvent;
    try {
      event = await this.webhookReceiver().receive(
        rawBody.toString('utf8'),
        authorization,
      );
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Live event not signed');
    }
    await this.enforce(event);
  }

  /** What an event of someone arriving asks for; any other event, nothing. */
  async enforce(event: WebhookEvent): Promise<void> {
    if (!ENTRY_EVENTS.has(event.event)) return;
    const streamId = event.room?.name;
    const profileId = event.participant?.identity;
    if (!streamId || !profileId) return;

    const stream = await this.prisma.liveStream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        status: true,
        hostId: true,
        audience: true,
        guests: { where: { status: 'ON_AIR' }, select: { profileId: true } },
      },
    });
    // A live that ended, or none: the room is closed with it.
    if (!stream || stream.status !== 'LIVE') return;
    if (profileId === stream.hostId) return;

    if (stream.guests.some((guest) => guest.profileId === profileId)) return;

    if (await this.mayNotWatch(stream, profileId)) {
      this.logger.log(`Took a Profile out of the room of stream ${stream.id}`);
      await this.recording.removeFromRoom(stream.id, profileId);
      return;
    }
    if (event.participant?.permission?.canPublish) {
      this.logger.log(
        `Took the right to publish from a Profile in stream ${stream.id}`,
      );
      await this.recording.stopPublishing(stream.id, profileId);
    }
  }

  // A block with the host, or what the live's audience allows, which also
  // keeps out one in a block with a guest on air.
  private async mayNotWatch(
    stream: StreamAudienceFields,
    profileId: string,
  ): Promise<boolean> {
    if (await isBlockedEitherWay(this.prisma, profileId, stream.hostId)) {
      return true;
    }
    return !(await canWatchStream(this.prisma, stream, profileId));
  }
}
