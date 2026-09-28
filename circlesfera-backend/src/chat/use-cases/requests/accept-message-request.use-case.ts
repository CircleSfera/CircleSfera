import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Participant } from '@prisma/client';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class AcceptMessageRequestUseCase {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async execute(profileId: string, conversationId: string) {
    const participant: Participant | null =
      await this.prisma.participant.findFirst({
        where: { conversationId, profileId },
      });

    if (!participant || participant.deletedAt) {
      throw AppException.NotFound(
        ErrorCode.NOT_FOUND,
        'Conversation not found',
      );
    }

    if (!participant.hasAccepted) {
      await this.prisma.participant.update({
        where: { id: participant.id },
        data: {
          hasAccepted: true,
          lastReadAt: new Date(),
        },
      });
    }

    return { success: true };
  }
}
