import type { ChatConversationUpdatedEvent } from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
  ) {}

  async execute(
    profileId: string,
    conversationId: string,
    name?: string,
    avatarUrl?: string,
  ) {
    await this.chatAuth.assertGroupAdmin(
      conversationId,
      profileId,
      'Only group admins can update the group details',
    );

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data,
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

    const event: ChatConversationUpdatedEvent['payload'] = {
      participants: updated.participants || [],
      payload: updated,
    };
    this.eventEmitter.emit('chat.conversation.updated', event);

    return updated;
  }
}
