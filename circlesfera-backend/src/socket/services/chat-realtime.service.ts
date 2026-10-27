import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { AddReactionUseCase } from '../../chat/use-cases/messages/add-reaction.use-case.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AddReactionResult {
  success: boolean;
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
   * The Profiles of the list that are in the conversation now: a row of
   * theirs that they have not removed. Read from the database each time, so a
   * member who left, was removed or deleted the chat a moment ago is not one.
   * A pending invitation counts as in.
   */
  async membersOf(
    conversationId: string,
    profileIds: string[],
  ): Promise<Set<string>> {
    const rows = await this.prisma.participant.findMany({
      where: {
        conversationId,
        profileId: { in: [...new Set(profileIds)] },
        deletedAt: null,
      },
      select: { profileId: true },
    });
    return new Set(rows.map((row) => row.profileId));
  }

  /**
   * Authorizes and records a reaction on a chat message, retrieving conversation participants for broadcast.
   * Whether the caller is in the conversation is read from the database
   * every time, never from what the socket remembers.
   */
  async addReaction(
    messageId: string,
    conversationId: string,
    callerProfileId: string,
    reaction: string,
  ): Promise<AddReactionResult> {
    const members = await this.membersOf(conversationId, [callerProfileId]);
    if (!members.has(callerProfileId)) {
      this.logger.warn(
        `Unauthorized send_reaction attempt by profile ${callerProfileId} in conversation ${conversationId}`,
      );
      return { success: false };
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
