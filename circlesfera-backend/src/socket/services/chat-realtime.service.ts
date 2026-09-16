import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AddReactionUseCase } from '../../chat/use-cases/messages/add-reaction.use-case.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AddReactionResult {
  success: boolean;
  grantConversationAccess?: boolean;
  reactionRecord?: {
    id: string;
    reaction: string;
  };
  participantProfileIds?: string[];
}

@Injectable()
export class ChatRealtimeService {
  private readonly logger = new Logger(ChatRealtimeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(forwardRef(() => AddReactionUseCase))
    private readonly addReactionUseCase: AddReactionUseCase,
  ) {}

  /**
   * Authorizes and records a reaction on a chat message, retrieving conversation participants for broadcast.
   */
  async addReaction(
    messageId: string,
    conversationId: string,
    callerProfileId: string,
    reaction: string,
    hasConversationAccess: boolean,
  ): Promise<AddReactionResult> {
    let grantConversationAccess = false;

    if (!hasConversationAccess) {
      const participant = await this.prisma.participant.findUnique({
        where: {
          conversationId_profileId: {
            conversationId,
            profileId: callerProfileId,
          },
        },
      });

      if (!participant || participant.deletedAt) {
        this.logger.warn(
          `Unauthorized send_reaction attempt by profile ${callerProfileId} in conversation ${conversationId}`,
        );
        return { success: false };
      }

      grantConversationAccess = true;
    }

    try {
      const reactionRecord = await this.addReactionUseCase.execute(
        messageId,
        callerProfileId,
        reaction,
      );

      const conv = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { participants: { select: { profileId: true } } },
      });

      const participantProfileIds = conv
        ? conv.participants.map((p) => p.profileId)
        : [];

      return {
        success: true,
        grantConversationAccess,
        reactionRecord: {
          id: reactionRecord.id,
          reaction: reactionRecord.reaction,
        },
        participantProfileIds,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to add reaction to message ${messageId}: ${
          err instanceof Error ? err.message : 'Unknown'
        }`,
      );
      return { success: false };
    }
  }
}
