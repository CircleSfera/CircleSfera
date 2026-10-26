import { type ChatMessageDeletedEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { UploadsService } from '../../../uploads/uploads.service.js';

@Injectable()
export class DeleteMessageUseCase {
  private readonly logger = new Logger(DeleteMessageUseCase.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(UploadsService) private readonly uploadsService: UploadsService,
  ) {}

  // Ownership is enforced by OwnershipGuard at the controller level.
  async execute(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: { include: { participants: true } },
        media: { select: { url: true, standardUrl: true, thumbnailUrl: true } },
        voiceMedia: { select: { url: true } },
      },
    });

    if (!message)
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        isDeleted: true,
        // Every address of its files goes, with the links to the Media rows
        // that repeat them: a deleted message names no file any more.
        url: null,
        standardUrl: null,
        thumbnailUrl: null,
        mediaType: null,
        mediaId: null,
        voiceUrl: null,
        voiceDuration: null,
        voiceWaveform: Prisma.DbNull,
        voiceMediaId: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
          },
        },
      },
    });

    const event: ChatMessageDeletedEvent['payload'] = {
      participants: message.conversation.participants,
      payload: { messageId },
    };
    this.eventEmitter.emit('chat.message.deleted', event);

    // Then its files: kept 30 days, readable by their owner only, then
    // erased (PD-040); a message cannot be restored, but its files are kept
    // all the same. A forwarded copy that still names a file keeps it.
    await this.uploadsService
      .releaseContentFiles([
        message.url,
        message.standardUrl,
        message.thumbnailUrl,
        message.voiceUrl,
        message.media?.url,
        message.media?.standardUrl,
        message.media?.thumbnailUrl,
        message.voiceMedia?.url,
      ])
      .catch((error: unknown) =>
        this.logger.warn(
          `Failed to settle the files of message ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );

    return { success: true, message: updated };
  }
}
