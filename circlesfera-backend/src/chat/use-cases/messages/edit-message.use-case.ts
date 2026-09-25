import { type ChatMessageEditedEvent, ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class EditMessageUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  // Ownership is enforced by OwnershipGuard at the controller level.
  async execute(messageId: string, newContent: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message)
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');
    if (message.isDeleted) {
      throw AppException.BadRequest(
        ErrorCode.BAD_REQUEST,
        'Cannot edit a deleted message',
      );
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: this.cryptoService.encrypt(newContent),
        isEdited: true,
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

    updated.content = newContent;
    const event: ChatMessageEditedEvent['payload'] = {
      participants: message.conversation.participants,
      payload: updated,
    };
    this.eventEmitter.emit('chat.message.edited', event);

    return updated;
  }
}
