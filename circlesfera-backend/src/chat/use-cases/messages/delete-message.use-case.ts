import { type ChatMessageDeletedEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  // Ownership is enforced by OwnershipGuard at the controller level.
  async execute(messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message)
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        isDeleted: true,
        url: null,
        mediaType: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatar: true,
            user: { select: { id: true } },
          },
        },
      },
    });

    const event: ChatMessageDeletedEvent['payload'] = {
      participants: message.conversation.participants,
      payload: { messageId },
    };
    this.eventEmitter.emit('chat.message.deleted', event);

    return { success: true, message: updated };
  }
}
