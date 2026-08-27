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
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';
import { UpdateGroupDto } from './dto/update-group.dto.js';
// Group Commands
import { CreateGroupUseCase } from './use-cases/groups/create-group.use-case.js';
import { DeleteConversationUseCase } from './use-cases/groups/delete-conversation.use-case.js';
import { LeaveGroupUseCase } from './use-cases/groups/leave-group.use-case.js';
import { RemoveParticipantUseCase } from './use-cases/groups/remove-participant.use-case.js';
import { UpdateGroupUseCase } from './use-cases/groups/update-group.use-case.js';
// Message Commands
import { DeleteMessageUseCase } from './use-cases/messages/delete-message.use-case.js';
import { EditMessageUseCase } from './use-cases/messages/edit-message.use-case.js';
import { MarkAsReadUseCase } from './use-cases/messages/mark-as-read.use-case.js';
import { SendMessageUseCase } from './use-cases/messages/send-message.use-case.js';
// Queries
import { GetConversationsQuery } from './use-cases/queries/get-conversations.query.js';
import { GetMessagesQuery } from './use-cases/queries/get-messages.query.js';
import { GetUnreadCountQuery } from './use-cases/queries/get-unread-count.query.js';

interface AuthenticatedRequest extends Request {
  profile: {
    profileId: string;
    email: string;
  };
}

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    @Inject(GetConversationsQuery)
    private readonly getConversationsQuery: GetConversationsQuery,
    @Inject(GetMessagesQuery)
    private readonly getMessagesQuery: GetMessagesQuery,
    @Inject(GetUnreadCountQuery)
    private readonly getUnreadCountQuery: GetUnreadCountQuery,
    @Inject(SendMessageUseCase)
    private readonly sendMessageUseCase: SendMessageUseCase,
    @Inject(EditMessageUseCase)
    private readonly editMessageUseCase: EditMessageUseCase,
    @Inject(DeleteMessageUseCase)
    private readonly deleteMessageUseCase: DeleteMessageUseCase,
    @Inject(MarkAsReadUseCase)
    private readonly markAsReadUseCase: MarkAsReadUseCase,
    @Inject(CreateGroupUseCase)
    private readonly createGroupUseCase: CreateGroupUseCase,
    @Inject(UpdateGroupUseCase)
    private readonly updateGroupUseCase: UpdateGroupUseCase,
    @Inject(RemoveParticipantUseCase)
    private readonly removeParticipantUseCase: RemoveParticipantUseCase,
    @Inject(LeaveGroupUseCase)
    private readonly leaveGroupUseCase: LeaveGroupUseCase,
    @Inject(DeleteConversationUseCase)
    private readonly deleteConversationUseCase: DeleteConversationUseCase,
  ) {}

  @Get('conversations')
  async getConversations(
    @Request() req: AuthenticatedRequest,
  ): Promise<Conversation[]> {
    return this.getConversationsQuery.execute(req.user.profileId);
  }

  @Get('conversations/unread-count')
  async getUnreadCount(
    @Request() req: AuthenticatedRequest,
  ): Promise<{ count: number }> {
    const count = await this.getUnreadCountQuery.execute(req.user.profileId);
    return { count };
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<Message[]> {
    return this.getMessagesQuery.execute(id, 50, req.user.profileId);
  }

  @Post('conversations')
  @UseGuards(EmailVerifiedGuard)
  async createGroup(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateGroupDto,
  ) {
    return this.createGroupUseCase.execute(
      req.user.profileId,
      dto.participantIds,
      dto.name,
    );
  }

  @Post('messages')
  @UseGuards(EmailVerifiedGuard)
  async sendMessage(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SendMessageDto,
  ): Promise<Message> {
    return this.sendMessageUseCase.execute(
      req.user.profileId,
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

  @Put('conversations/:id/read')
  async markRead(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.markAsReadUseCase.execute(id, req.user.profileId);
    return { success: true };
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('mode') _mode: 'me' | 'both' = 'me',
  ) {
    // Mode is intentionally ignored by the use case for security but maintained in the signature for frontend compat.
    return this.deleteConversationUseCase.execute(req.user.profileId, id);
  }

  @Put('conversations/:id/group')
  async updateGroup(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateGroupDto,
  ) {
    return this.updateGroupUseCase.execute(
      req.user.profileId,
      id,
      body.name,
      body.avatarUrl,
    );
  }

  @Delete('conversations/:id/participants/:profileId')
  async removeParticipant(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('profileId') targetProfileId: string,
  ) {
    return this.removeParticipantUseCase.execute(
      req.user.profileId,
      id,
      targetProfileId,
    );
  }

  @Delete('conversations/:id/leave')
  async leaveGroup(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.leaveGroupUseCase.execute(req.user.profileId, id);
  }

  @Put('messages/:id')
  async editMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: EditMessageDto,
  ) {
    return this.editMessageUseCase.execute(
      req.user.profileId,
      id,
      body.content,
    );
  }

  @Delete('messages/:id')
  async deleteMessage(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.deleteMessageUseCase.execute(req.user.profileId, id);
  }
}
