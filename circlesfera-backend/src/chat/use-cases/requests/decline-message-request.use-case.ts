import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { LeaveGroupUseCase } from '../groups/leave-group.use-case.js';

@Injectable()
export class DeclineMessageRequestUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(LeaveGroupUseCase) private leaveGroup: LeaveGroupUseCase,
  ) {}

  // Declining an invitation hides the group or chat from the invited Profile.
  // A group they had already accepted is one they are in: declining it is
  // leaving it, so the group keeps an admin and its members are told.
  async execute(profileId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
      include: { conversation: { select: { isGroup: true } } },
    });

    if (!participant || participant.deletedAt) {
      throw AppException.NotFound(
        ErrorCode.NOT_FOUND,
        'Conversation not found',
      );
    }

    if (participant.hasAccepted && participant.conversation.isGroup) {
      return this.leaveGroup.execute(profileId, conversationId);
    }

    await this.prisma.participant.update({
      where: { id: participant.id },
      data: {
        deletedAt: new Date(),
        clearedAt: new Date(),
      },
    });

    return { success: true };
  }
}
