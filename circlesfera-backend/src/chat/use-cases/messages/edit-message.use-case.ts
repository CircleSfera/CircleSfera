import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { CryptoService } from '../../../common/services/crypto.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class EditMessageUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(profileId: string, messageId: string, newContent: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message)
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');
    if (message.senderId !== profileId) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You can only edit your own messages',
      );
    }
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
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });

    updated.content = newContent;
    message.conversation.participants.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.profileId}`)
        .emit('message_edited', updated);
    });

    return updated;
  }
}
