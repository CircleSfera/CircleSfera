import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service.js';
import {
  USER_HARD_DELETED_EVENT,
  type UserHardDeletedEvent,
} from '../../../users/events/user-hard-deleted.event.js';

@Injectable()
export class HandleUserDeletedUseCase {
  private readonly logger = new Logger(HandleUserDeletedUseCase.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(USER_HARD_DELETED_EVENT)
  async execute(payload: UserHardDeletedEvent) {
    try {
      const profileIds =
        payload.profileIds && payload.profileIds.length > 0
          ? payload.profileIds
          : payload.profileId
            ? [payload.profileId]
            : [];

      if (profileIds.length === 0) {
        return;
      }

      const messages = await this.prisma.message.findMany({
        where: { senderId: { in: profileIds } },
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
    } catch (error) {
      this.logger.error(
        'Failed to handle chat message media cleanup for deleted user',
        error,
      );
    }
  }
}
