/* eslint-disable */
// @ts-nocheck
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ChatService } from './chat.service.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    email: string;
  };
}

/** REST controller for chat conversations, messaging, and reactions. All endpoints require authentication. */
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(@Inject(ChatService) private readonly chatService: ChatService) {}

  /** List all conversations for the authenticated user. */
  @Get('conversations')
  async getConversations(
    @Request() req: AuthenticatedRequest,
  ): Promise<Conversation[]> {
    return this.chatService.getConversations(req.user.userId);
  }

  /** Get unread conversations count for the authenticated user. */
  @Get('conversations/unread-count')
  async getUnreadCount(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    const count = await this.chatService.getUnreadCount(req.user.userId);
    return { count };
  }

  /** Get messages for a specific conversation. */
  @Get('conversations/:id/messages')
  async getMessages(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<Message[]> {
    return this.chatService.getMessages(id, 50, req.user.userId);
  }

  /** Create a new group conversation. */
  @Post('conversations')
  async createGroup(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ) {
    return this.chatService.createGroup(
      req.user.userId,
      dto.participantIds,
      dto.name,
    );
  }

  /** Send a message (creates a new DM or sends to existing conversation). */
  @Post('messages')
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ): Promise<Message> {
    return this.chatService.sendMessage(
      req.user.userId,
      dto.recipientId,
      dto.content,
      dto.mediaUrl,
      dto.mediaType,
      dto.conversationId,
      dto.tempId,
      dto.postId,
      dto.storyId,
      dto.replyToId,
    );
  }

  /** Mark all messages in a conversation as read. */
  @Put('conversations/:id/read')
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.chatService.markAsRead(id, req.user.userId);
    return { success: true };
  }

  /** Delete a conversation (participant only). Soft-delete for self. */
  @Delete('conversations/:id')
  async deleteConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.chatService.deleteConversation(id, req.user.userId);
  }

  /** Update group details (Admins only) */
  @Put('conversations/:id/group')
  async updateGroup(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { name?: string; avatarUrl?: string },
  ) {
    return this.chatService.updateGroup(
      req.user.userId,
      id,
      body.name,
      body.avatarUrl,
    );
  }

  /** Remove a participant from the group (Admins only) */
  @Delete('conversations/:id/participants/:userId')
  async removeParticipant(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.chatService.removeParticipant(
      req.user.userId,
      id,
      targetUserId,
    );
  }

  /** Leave a group */
  @Delete('conversations/:id/leave')
  async leaveGroup(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.chatService.leaveGroup(req.user.userId, id);
  }

  /** Edit a message. */
  @Put('messages/:id')
  async editMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { content: string },
  ) {
    return this.chatService.editMessage(req.user.userId, id, body.content);
  }

  /** Delete a message. */
  @Delete('messages/:id')
  async deleteMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.chatService.deleteMessage(req.user.userId, id);
  }
}
