import type { ChatConversationUpdatedEvent } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';
import { GroupAdminSuccessionService } from '../../services/group-admin-succession.service.js';

@Injectable()
export class MakeGroupAdminUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
    @Inject(GroupAdminSuccessionService)
    private succession: GroupAdminSuccessionService,
  ) {}

  // Any admin of a group makes another member admin, at any time. The member
  // must be one who may be admin; one who is admin already stays so and
  // nothing changes. The group is told who is now admin.
  async execute(
    profileId: string,
    conversationId: string,
    targetProfileId: string,
  ) {
    await this.chatAuth.assertGroupAdmin(
      conversationId,
      profileId,
      'Only group admins can make admins',
    );

    const notice = await this.prisma.$transaction((tx) =>
      this.succession.grantAdmin(conversationId, targetProfileId, tx),
    );

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

    if (notice && updated) {
      const event: ChatConversationUpdatedEvent['payload'] = {
        participants: updated.participants,
        payload: updated,
      };
      this.eventEmitter.emit('chat.conversation.updated', event);
    }
    await this.succession.announce([notice]);

    return updated;
  }
}
