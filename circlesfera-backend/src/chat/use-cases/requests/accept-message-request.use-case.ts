import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

interface ParticipantRecord {
  id: string;
  hasAccepted: boolean;
  deletedAt: Date | null;
}

@Injectable()
export class AcceptMessageRequestUseCase {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async execute(profileId: string, conversationId: string) {
    const participant = (await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    })) as unknown as ParticipantRecord | null;

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
