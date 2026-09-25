import { ErrorCode } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import type { Participant } from '@prisma/client';
import { AppException } from '../../common/errors/app.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

// Shared checks for chat use-cases that need their own DB round-trip to
// verify conversation membership or admin rights. Use-cases that already
// have participants loaded via a broader query (SendMessageUseCase,
// AddReactionUseCase, DeleteConversationUseCase's heavier include) check
// membership in-memory instead of calling this, to avoid a redundant query
// or a mismatched include shape.
@Injectable()
export class ChatAuthorizationService {
  constructor(@Inject(PrismaService) private prisma: PrismaService) {}

  async assertParticipant(
    conversationId: string,
    profileId: string,
    message = 'Not a participant in this conversation',
  ): Promise<Participant> {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    });
    if (!participant) {
      throw AppException.Forbidden(ErrorCode.FORBIDDEN_ACCESS, message);
    }
    return participant;
  }

  async assertGroupAdmin(
    conversationId: string,
    profileId: string,
    message = 'Only group admins can perform this action',
  ): Promise<Participant> {
    const participant = await this.assertParticipant(
      conversationId,
      profileId,
      message,
    );
    if (!participant.isAdmin) {
      throw AppException.Forbidden(ErrorCode.FORBIDDEN_ACCESS, message);
    }
    return participant;
  }
}
