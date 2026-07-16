import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { type Message, type MessageReaction } from '@prisma/client';
import { CryptoService } from '../common/services/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { AppGateway } from '../socket/app.gateway.js';

/**
 * Service for real-time messaging: conversations, messages, reactions, and group chats.
 * Integrates with AppGateway for WebSocket broadcast of new messages.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @Inject(PrismaService) private prisma: PrismaService,
    @Inject(ModuleRef) private moduleRef: ModuleRef,
    @Inject(CryptoService) private cryptoService: CryptoService,
    @Inject(PushService) private pushService: PushService,
  ) {}

  private get gateway(): AppGateway {
    return this.moduleRef.get(AppGateway, { strict: false });
  }

  /**
   * Create a group conversation with multiple participants.
   * Re-uses an existing conversation if one already exists with the same participant set.
   * @param userId - The creator's user ID
   * @param participantIds - Array of user IDs to include
   * @param name - Optional group name
   */
  async createGroup(userId: string, participantIds: string[], name?: string) {
    const uniqueParticipantIds = Array.from(
      new Set(participantIds.filter((id) => id !== userId)),
    );

    if (uniqueParticipantIds.length === 0) {
      throw new BadRequestException(
        'Cannot create a conversation with yourself',
      );
    }

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: uniqueParticipantIds } },
          { blockedId: userId, blockerId: { in: uniqueParticipantIds } },
        ],
      },
    });

    if (blocks.length > 0) {
      throw new ForbiddenException(
        'Cannot create a conversation with blocked users',
      );
    }

    // If only 1 other participant and no group name, treat as 1-on-1
    if (uniqueParticipantIds.length === 1 && !name) {
      const recipientId = uniqueParticipantIds[0];

      // Find existing 1-on-1
      const existing = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: recipientId } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  profile: true,
                },
              },
            },
          },
        },
      });

      if (existing) return existing;

      // Create isGroup: false
      return this.prisma.conversation.create({
        data: {
          isGroup: false,
          participants: {
            create: [{ userId }, { userId: recipientId }],
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  profile: true,
                },
              },
            },
          },
        },
      });
    }

    // Otherwise create group
    const allParticipantIds = Array.from(
      new Set([userId, ...uniqueParticipantIds]),
    );

    const conversation = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: allParticipantIds.map((id) => ({
            userId: id,
            isAdmin: id === userId, // The creator is the admin
          })),
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                profile: true,
              },
            },
          },
        },
      },
    });

    return conversation;
  }

  /**
   * Update a group's name and avatar. Only admins can do this.
   */
  async updateGroup(
    userId: string,
    conversationId: string,
    name?: string,
    avatarUrl?: string,
  ) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
    });

    if (!participant?.isAdmin) {
      throw new ForbiddenException(
        'Only group admins can update the group details',
      );
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
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
    });

    // Notify participants
    updated?.participants?.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('conversation_updated', updated);
    });

    return updated;
  }

  /**
   * Remove a participant from the group. Only admins can do this.
   */
  async removeParticipant(
    userId: string,
    conversationId: string,
    targetUserId: string,
  ) {
    const admin = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
    });

    if (!admin?.isAdmin) {
      throw new ForbiddenException('Only group admins can remove participants');
    }

    const targetParticipant = await this.prisma.participant.findFirst({
      where: { conversationId, userId: targetUserId },
    });

    if (!targetParticipant) {
      throw new NotFoundException('Participant not found');
    }

    await this.prisma.participant.delete({
      where: { id: targetParticipant.id },
    });

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
    });

    // Notify everyone including the removed user
    if (updated) {
      [...(updated.participants || []), targetParticipant].forEach((p: any) => {
        this.gateway.server
          .to(`user:${p.userId}`)
          .emit('conversation_updated', updated);
      });
    }

    return updated;
  }

  /**
   * Leave a group conversation.
   */
  async leaveGroup(userId: string, conversationId: string) {
    const participant = await this.prisma.participant.findFirst({
      where: { conversationId, userId },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    await this.prisma.participant.delete({
      where: { id: participant.id },
    });

    const updated = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true, profile: true },
            },
          },
        },
      },
    });

    // If no participants left, we might delete the conversation, but for now we leave it.
    if (updated) {
      updated?.participants?.forEach((p: any) => {
        this.gateway.server
          .to(`user:${p.userId}`)
          .emit('conversation_updated', updated);
      });
    }

    // Notify the user who left
    this.gateway.server
      .to(`user:${userId}`)
      .emit('conversationDeleted', { conversationId });

    return { success: true };
  }

  /**
   * Send a message in an existing conversation or create a new DM conversation.
   * Broadcasts the message to all participants via WebSocket.
   * @param senderId - The sender's user ID
   * @param recipientId - Optional recipient for new DM conversations
   * @param content - Message text content
   * @param url - Optional media attachment URL
   * @param mediaType - Optional media type (image, video, etc.)
   * @param conversationId - Optional existing conversation ID
   * @param tempId - Optional client-side temporary ID for optimistic updates
   * @param postId - Optional shared post ID
   * @returns The created message with sender profile
   */
  async sendMessage(
    senderId: string,
    recipientId: string | undefined,
    content: string,
    url?: string,
    mediaType?: string,
    conversationId?: string,
    tempId?: string,
    postId?: string,
    storyId?: string,
    replyToId?: string,
  ): Promise<Message> {
    let conversation: any;

    if (conversationId) {
      conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true },
              },
            },
          },
        },
      });

      if (!conversation) throw new NotFoundException('Conversation not found');

      // Verify participation
      const isParticipant = conversation.participants.some(
        (p: any) => p.userId === senderId,
      );
      if (!isParticipant) throw new ForbiddenException('Not a participant');
    } else if (recipientId) {
      // 1. Find or create 1-on-1 conversation
      conversation = await this.prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { userId: senderId } } },
            { participants: { some: { userId: recipientId } } },
          ],
        },
        include: {
          participants: {
            include: {
              user: {
                select: { id: true },
              },
            },
          },
        },
      });

      if (!conversation) {
        conversation = await this.prisma.conversation.create({
          data: {
            isGroup: false,
            participants: {
              create: [{ userId: senderId }, { userId: recipientId }],
            },
          },
          include: { participants: true },
        });
      }
    } else {
      throw new BadRequestException(
        'Either conversationId or recipientId is required',
      );
    }

    const participantIds = conversation.participants
      .map((p: any) => p.userId)
      .filter((id: string) => id !== senderId);

    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: senderId, blockedId: { in: participantIds } },
          { blockedId: senderId, blockerId: { in: participantIds } },
        ],
      },
    });

    if (blocks.length > 0) {
      throw new ForbiddenException(
        'Cannot send message: Blocked by a participant or you blocked them',
      );
    }

    // 2. Create message (content encrypted in server)
    const message = await this.prisma.message.create({
      data: {
        content: this.cryptoService.encrypt(content),
        senderId,
        conversationId: conversation.id,
        url,
        mediaType,
        postId,
        storyId,
        replyToId,
      },
      include: {
        sender: {
          select: {
            id: true,
            profile: {
              select: { username: true, avatar: true },
            },
          },
        },
        post: {
          include: {
            media: true,
            user: {
              include: { profile: true },
            },
          },
        },
        story: {
          include: {
            user: {
              include: { profile: true },
            },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                profile: { select: { username: true } },
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                profile: { select: { username: true } },
              },
            },
          },
        },
      },
    });

    // 3. Reactivate conversation for all participants (if they had deleted it)
    await this.prisma.participant.updateMany({
      where: {
        conversationId: conversation.id,
        deletedAt: { not: null },
      },
      data: {
        deletedAt: null,
      },
    });

    // 4. Emit to all participants
    // We send decrypted content to the client in real-time
    conversation.participants.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('receiveMessage', { ...message, content, tempId });

      if (p.userId !== senderId) {
        this.pushService
          .sendNotification(p.userId, {
            title: `Nuevo mensaje cifrado`,
            body: `Has recibido un mensaje de @${message.sender.profile?.username || 'Alguien'}`,
            data: { url: `/chat/${conversation.id}`, type: 'chat' },
          })
          .catch((err) =>
            this.logger.error(
              'Failed sending push notification for chat message',
              err,
            ),
          );
      }
    });

    return message;
  }

  /**
   * Mark all messages in a conversation as read for a specific user.
   * @param conversationId - The conversation ID
   * @param userId - The user marking messages as read
   */
  async markAsRead(conversationId: string, userId: string) {
    await this.prisma.participant.updateMany({
      where: {
        conversationId,
        userId,
      },
      data: {
        lastReadAt: new Date(),
      },
    });
  }

  /**
   * Retrieve all conversations for a user, sorted by last activity.
   * Includes the last message and participant profiles.
   * @param userId - The authenticated user's ID
   * @returns Array of conversations with participants and last message
   */
  async getConversations(userId: string) {
    // Find all conversations where the user is a participant
    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            userId,
            deletedAt: null,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,

                profile: {
                  select: {
                    username: true,
                    avatar: true,
                    fullName: true,
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const decryptedConversations = conversations.map((conv) => {
      if (conv.messages?.length > 0) {
        const lastMsg = conv.messages[0];
        if (lastMsg.content) {
          lastMsg.content = this.cryptoService.decrypt(lastMsg.content);
        }
      }
      return conv;
    });

    return decryptedConversations;
  }

  /**
   * Calculate total unread conversations count for a user.
   */
  async getUnreadCount(userId: string): Promise<number> {
    const conversations = await this.getConversations(userId);
    let unreadCount = 0;

    for (const conv of conversations as {
      messages?: any[];
      participants: any[];
    }[]) {
      const lastMsg = conv.messages?.[0];
      if (!lastMsg) continue;

      // Unread if the last message is NOT from the current user
      if (lastMsg.senderId === userId) continue;

      const myParticipant = conv.participants.find(
        (p: any) => p.userId === userId,
      );

      // If no lastReadAt or message is newer than lastReadAt
      if (
        !myParticipant?.lastReadAt ||
        new Date(lastMsg.createdAt).getTime() >
          new Date(myParticipant.lastReadAt).getTime()
      ) {
        unreadCount++;
      }
    }

    return unreadCount;
  }

  /**
   * Retrieve messages for a conversation with pagination.
   * Validates the user is a participant before returning messages.
   * @param conversationId - The conversation ID
   * @param limit - Maximum number of messages to return (default 50)
   * @param userId - Optional user ID for participant validation
   * @returns Array of messages ordered by creation time (ascending)
   * @throws ForbiddenException if user is not a participant
   */
  async getMessages(
    conversationId: string,
    limit = 50,
    userId?: string,
  ): Promise<Message[]> {
    if (userId) {
      const isParticipant = await this.prisma.participant.findFirst({
        where: {
          conversationId,
          userId,
        },
      });

      if (!isParticipant) {
        throw new ForbiddenException(
          'You are not a participant in this conversation',
        );
      }
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        sender: {
          select: {
            id: true,
            profile: {
              select: { username: true, avatar: true },
            },
          },
        },
        post: {
          include: {
            media: true,
            user: {
              include: { profile: true },
            },
          },
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                profile: { select: { username: true } },
              },
            },
          },
        },
        reactions: {
          include: {
            user: {
              select: {
                profile: { select: { username: true } },
              },
            },
          },
        },
      },
    });

    // Decrypt messages
    return messages.map((m) => {
      if (m.content) {
        m.content = this.cryptoService.decrypt(m.content);
      }
      return m;
    }) as any;
  }

  /**
   * Add or update a reaction (emoji) on a message.
   * Upserts: creates a new reaction or updates the existing one.
   * @param messageId - The message to react to
   * @param userId - The reacting user's ID
   * @param reaction - The emoji/reaction string
   * @returns The created or updated reaction
   */
  async addReaction(
    messageId: string,
    userId: string,
    reaction: string,
  ): Promise<MessageReaction> {
    // 1. Verify message exists and user is a participant
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isParticipant = message.conversation.participants.some(
      (p) => p.userId === userId,
    );

    if (!isParticipant) {
      throw new ForbiddenException('Not a participant in this conversation');
    }
    // Check if reaction exists
    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
    });

    if (existing) {
      return await this.prisma.messageReaction.update({
        where: { id: existing.id },
        data: { reaction },
      });
    }

    return await this.prisma.messageReaction.create({
      data: {
        messageId,
        userId,
        reaction,
      },
    });
  }

  /**
   * Delete a conversation for a user. Only participants can delete.
   * @param conversationId - The conversation ID to delete
   * @param userId - The requesting user's ID
   * @throws NotFoundException if conversation not found
   * @throws ForbiddenException if user is not a participant
   */
  async deleteConversation(conversationId: string, userId: string) {
    const isParticipant = await this.prisma.participant.findFirst({
      where: {
        conversationId,
        userId,
      },
    });

    if (!isParticipant) {
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    }

    // Soft delete for this user only
    await this.prisma.participant.update({
      where: { id: isParticipant.id },
      data: { deletedAt: new Date() },
    });

    // Emit only to the user who deleted it
    this.gateway.server
      .to(`user:${userId}`)
      .emit('conversationDeleted', { conversationId });

    return { success: true, mode: 'me' };
  }

  /**
   * Edit a message. Only the sender can edit their own message.
   */
  async editMessage(userId: string, messageId: string, newContent: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }
    if (message.isDeleted) {
      throw new BadRequestException('Cannot edit a deleted message');
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: this.cryptoService.encrypt(newContent),
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });

    // Emit to all participants
    updated.content = newContent; // send decrypted text back to clients
    message.conversation.participants.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('message_edited', updated);
    });

    return updated;
  }

  /**
   * Delete a message. Only the sender can delete their own message.
   */
  async deleteMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    // Soft delete: clear content and keys, set isDeleted
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: '',
        isDeleted: true,
        url: null,
        mediaType: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            profile: { select: { username: true, avatar: true } },
          },
        },
      },
    });

    // Emit to all participants
    message.conversation.participants.forEach((p: any) => {
      this.gateway.server
        .to(`user:${p.userId}`)
        .emit('message_deleted', { messageId });
    });

    return { success: true, message: updated };
  }

  /**
   * Cron job to physically delete expired messages (GDPR/Disappearing messages).
   * Runs every hour via BullMQ.
   */
  async cleanupExpiredMessages() {
    try {
      const deleted = await this.prisma.message.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      if (deleted.count > 0) {
        this.logger.log(`Cleaned up ${deleted.count} expired messages.`);
      }
    } catch (error) {
      this.logger.error('Failed to clean up expired messages', error);
    }
  }
}
