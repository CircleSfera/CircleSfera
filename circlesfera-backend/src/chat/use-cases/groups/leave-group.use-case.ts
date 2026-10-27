import {
  type ChatConversationDeletedEvent,
  type ChatConversationUpdatedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { GroupAdminSuccessionService } from '../../services/group-admin-succession.service.js';

@Injectable()
export class LeaveGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(GroupAdminSuccessionService)
    private succession: GroupAdminSuccessionService,
  ) {}

  // An admin who leaves may name the member who becomes admin after them
  // (successorId). Naming them and leaving happen together, or neither does.
  // Without one, or if they do not stay admin, the group still gets an admin.
  async execute(
    profileId: string,
    conversationId: string,
    successorId?: string,
  ) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, profileId },
    });

    if (!participant) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'You are not a participant in this conversation',
      );
    }

    if (successorId !== undefined) {
      if (!participant.isAdmin) {
        throw AppException.Forbidden(
          ErrorCode.FORBIDDEN_ACCESS,
          'Only group admins can name an admin',
        );
      }
      if (successorId === profileId) {
        throw AppException.BadRequest(
          ErrorCode.GROUP_ADMIN_NOT_ELIGIBLE,
          'Name another member of the group',
        );
      }
    }

    const notices = await this.prisma.$transaction(async (tx) => {
      const named = successorId
        ? await this.succession.grantAdmin(conversationId, successorId, tx)
        : null;
      await tx.participant.delete({ where: { id: participant.id } });
      const fallback = await this.succession.ensureAdmin(conversationId, tx);
      return [named, fallback];
    });

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            profile: {
              select: {
                id: true,
                username: true,
                avatar: true,
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (updated) {
      const updatedEvent: ChatConversationUpdatedEvent['payload'] = {
        participants: updated.participants || [],
        payload: updated,
      };
      this.eventEmitter.emit('chat.conversation.updated', updatedEvent);
    }

    await this.succession.announce(notices);

    const deletedEvent: ChatConversationDeletedEvent['payload'] = {
      participants: [{ profileId }],
      payload: { conversationId },
    };
    this.eventEmitter.emit('chat.conversation.deleted', deletedEvent);

    return { success: true };
  }
}
