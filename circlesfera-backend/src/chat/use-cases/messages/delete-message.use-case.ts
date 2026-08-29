import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AppGateway } from '../../../socket/app.gateway.js';

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  async execute(profileId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message)
      throw AppException.NotFound(ErrorCode.NOT_FOUND, 'Message not found');
    if (message.senderId !== profileId) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You can only delete your own messages',
      );
    }

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

    message.conversation.participants.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.profileId}`)
        .emit('message_deleted', { messageId });
    });

    return { success: true, message: updated };
  }
}
