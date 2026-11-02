import {
  type ChatConversationUpdatedEvent,
  ErrorCode,
} from '@circlesfera/shared';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppException } from '../../../common/errors/app.exception.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StoredFilesService } from '../../../uploads/services/stored-files.service.js';
import { maskedForViewer } from '../../blocked-participants.js';
import { ChatAuthorizationService } from '../../services/chat-authorization.service.js';

@Injectable()
export class UpdateGroupUseCase {
  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(EventEmitter2) private eventEmitter: EventEmitter2,
    @Inject(ChatAuthorizationService)
    private chatAuth: ChatAuthorizationService,
    @Inject(StoredFilesService)
    private readonly storedFiles: StoredFilesService,
  ) {}

  async execute(
    profileId: string,
    conversationId: string,
    name?: string,
    avatarUrl?: string | null,
  ) {
    await this.chatAuth.assertGroupAdmin(
      conversationId,
      profileId,
      'Only group admins can update the group details',
    );
    // A new photo must be the admin's own stored file; the photo the group
    // already has is sent back as it is, whichever admin set it.
    if (avatarUrl) {
      const current = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { avatarUrl: true },
      });
      if (avatarUrl !== current?.avatarUrl) {
        // A file of this server is given only by its own address, the one
        // the ownership check reads: another host's address with the path of
        // one of its files would escape the check.
        if (this.storedFiles.namesStoredFileIndirectly(avatarUrl)) {
          throw AppException.BadRequest(
            ErrorCode.INVALID_INPUT,
            'A photo of this server is given by its own address',
          );
        }
        await this.storedFiles.assertOwnedBy(profileId, [avatarUrl]);
      }
    }

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

    // The caller sees anyone in a block with them as unavailable.
    return updated ? maskedForViewer(this.prisma, profileId, updated) : updated;
  }
}
