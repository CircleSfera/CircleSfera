import {
  type ChatConversationCreatedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

@Injectable()
export class CreateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
  ) {}

  async execute(profileId: string, participantIds: string[], name?: string) {
    const uniqueParticipantIds = Array.from(
      new Set(participantIds.filter((id) => id !== profileId)),
    );

    if (uniqueParticipantIds.length === 0) {
      throw AppException.BadRequest(
        ErrorCode.BAD_REQUEST,
        'Cannot create a conversation with yourself',
      );
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: profileId, blockedId: { in: uniqueParticipantIds } },
          { blockedId: profileId, blockerId: { in: uniqueParticipantIds } },
        ],
      },
    });

    if (blocks.length > 0) {
      throw AppException.Forbidden(
        ErrorCode.FORBIDDEN_ACCESS,
        'Cannot create a conversation with blocked users',
      );
    }

    if (uniqueParticipantIds.length === 1 && !name) {
      const recipientId = uniqueParticipantIds[0];

      const existing = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { profileId } } },
            { participants: { some: { profileId: recipientId } } },
          ],
        },
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

      if (existing) return existing;

      const recipientFollows = await this.prisma.follow.findFirst({
        where: {
          followerId: recipientId,
          followingId: profileId,
          status: 'ACCEPTED',
        },
      });

      return this.prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [
              { profileId, hasAccepted: true },
              {
                profileId: recipientId,
                hasAccepted: Boolean(recipientFollows),
              },
            ],
          },
        },
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
    }

    const nonCreatorIds = uniqueParticipantIds.filter((id) => id !== profileId);
    const follows = await this.prisma.follow.findMany({
      where: {
        followerId: { in: nonCreatorIds },
        followingId: profileId,
        status: 'ACCEPTED',
      },
      select: { followerId: true },
    });
    const followerIdSet = new Set(follows.map((f) => f.followerId));

    const allParticipantIds = Array.from(
      new Set([profileId, ...uniqueParticipantIds]),
    );

    const conversation = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: allParticipantIds.map((id) => ({
            profileId: id,
            isAdmin: id === profileId,
            hasAccepted: id === profileId || followerIdSet.has(id),
          })),
        },
      },
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

    const event: ChatConversationCreatedEvent['payload'] = { conversation };
    this.eventEmitter.emit('chat.conversation.created', event);

    return conversation;
  }
}
