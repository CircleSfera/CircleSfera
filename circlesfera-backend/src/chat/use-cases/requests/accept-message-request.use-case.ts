import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GroupAdminSuccessionService } from '../../services/group-admin-succession.service.js';

interface ParticipantRecord {
  id: string;
  hasAccepted: boolean;
  deletedAt: Date | null;
}

@Injectable()
export class AcceptMessageRequestUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(GroupAdminSuccessionService)
    private succession: GroupAdminSuccessionService,
  ) {}

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
      // A group whose admin left while every other member was still invited
      // gets one as soon as someone accepts (PD-042).
      const notice = await this.prisma.$transaction(async (tx) => {
        await this.succession.lock(conversationId, tx);
        await tx.participant.update({
          where: { id: participant.id },
          data: {
            hasAccepted: true,
            lastReadAt: new Date(),
          },
        });
        return this.succession.ensureAdmin(conversationId, tx);
      });
      await this.succession.announce([notice]);
    }

    return { success: true };
  }
}
