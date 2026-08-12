import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class HandleUserDeletedUseCase {
  private readonly logger = new Logger(HandleUserDeletedUseCase.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('user.hard_deleted')
  async execute(payload: { userId: string }) {
    const messages = await this.prisma.message.findMany({
      where: { senderId: payload.userId },
    });

    const mediaUrls = new Set<string>();
    for (const msg of messages) {
      if (msg.url) mediaUrls.add(msg.url);
      if (msg.standardUrl) mediaUrls.add(msg.standardUrl);
      if (msg.thumbnailUrl) mediaUrls.add(msg.thumbnailUrl);
      if (msg.voiceUrl) mediaUrls.add(msg.voiceUrl);
    }

    if (mediaUrls.size > 0) {
      this.logger.log(
        `Emitting media.delete_batch for ${mediaUrls.size} files...`,
      );
      this.eventEmitter.emit('media.delete_batch', {
        mediaUrls: Array.from(mediaUrls),
      });
    }
  }
}
