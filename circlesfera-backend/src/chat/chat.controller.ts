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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import type { Request } from 'express';
import { type CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { RequireOwnership } from '../auth/decorators/require-ownership.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { OwnershipGuard } from '../auth/guards/ownership.guard.js';
import { ConversationPageDto } from './dto/conversation-page.dto.js';
import { CreateGroupDto } from './dto/create-group.dto.js';
import { EditMessageDto } from './dto/edit-message.dto.js';
import { MessagesBeforeDto } from './dto/messages-before.dto.js';
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
import {
  GetMessagesQuery,
  MESSAGE_PAGE,
} from './use-cases/queries/get-messages.query.js';
import { GetUnreadCountQuery } from './use-cases/queries/get-unread-count.query.js';
// Request Commands
import { AcceptMessageRequestUseCase } from './use-cases/requests/accept-message-request.use-case.js';
import { DeclineMessageRequestUseCase } from './use-cases/requests/decline-message-request.use-case.js';

interface AuthRequest extends Request {
  user: CurrentUserData;
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
    @Inject(AcceptMessageRequestUseCase)
    private readonly acceptMessageRequestUseCase: AcceptMessageRequestUseCase,
    @Inject(DeclineMessageRequestUseCase)
    private readonly declineMessageRequestUseCase: DeclineMessageRequestUseCase,
  ) {}

  @Get('conversations')
  async getConversations(
    @Req() req: AuthRequest,
    @Query('folder') folder?: 'inbox' | 'requests',
  ): Promise<Conversation[]> {
    return this.getConversationsQuery.execute(
      req.user.profileId,
      folder === 'requests' ? 'requests' : 'inbox',
    );
  }

  // The list a page at a time, so every conversation can be reached. Before
  // conversations/:id, which would otherwise take "page" as an id.
  @Get('conversations/page')
  async getConversationPage(
    @Req() req: AuthRequest,
    @Query() query: ConversationPageDto,
  ): Promise<{ items: Conversation[]; nextCursor: string | null }> {
    return this.getConversationsQuery.executePage(
      req.user.profileId,
      query.folder ?? 'inbox',
      query.cursor,
      query.limit,
    );
  }

  @Get('conversations/unread-count')
  async getUnreadCount(@Req() req: AuthRequest): Promise<{ count: number }> {
    const count = await this.getUnreadCountQuery.execute(req.user.profileId);
    return { count };
  }

  @Get('conversations/:id')
  async getConversation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<Conversation> {
    return this.getConversationsQuery.executeOne(id, req.user.profileId);
  }

  @Post('conversations/:id/accept')
  async acceptRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.acceptMessageRequestUseCase.execute(req.user.profileId, id);
  }

  @Post('conversations/:id/decline')
  async declineRequest(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    return this.declineMessageRequestUseCase.execute(req.user.profileId, id);
  }

  @Get('conversations/:id/messages')
  async getMessages(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query() query: MessagesBeforeDto,
  ): Promise<Message[]> {
    const before =
      query.before && query.beforeId
        ? { createdAt: new Date(query.before), id: query.beforeId }
        : undefined;
    return this.getMessagesQuery.execute(
      id,
      MESSAGE_PAGE,
      req.user.profileId,
      before,
    );
  }

  @Post('conversations')
  @UseGuards(EmailVerifiedGuard)
  async createGroup(@Req() req: AuthRequest, @Body() dto: CreateGroupDto) {
    return this.createGroupUseCase.execute(
      req.user.profileId,
      dto.participantIds,
      dto.name,
    );
  }

  @Post('messages')
  @UseGuards(EmailVerifiedGuard)
  async sendMessage(
    @Req() req: AuthRequest,
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
      dto.voiceUrl,
      dto.voiceDuration,
      dto.voiceWaveform,
      dto.isLocked,
      dto.priceCents,
    );
  }

  @Put('conversations/:id/read')
  async markRead(@Req() req: AuthRequest, @Param('id') id: string) {
    await this.markAsReadUseCase.execute(id, req.user.profileId);
    return { success: true };
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('mode') _mode: 'me' | 'both' = 'me',
  ) {
    // Mode is intentionally ignored by the use case for security but maintained in the signature for frontend compat.
    return this.deleteConversationUseCase.execute(req.user.profileId, id);
  }

  @Put('conversations/:id/group')
  async updateGroup(
    @Req() req: AuthRequest,
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
    @Req() req: AuthRequest,
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
  async leaveGroup(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.leaveGroupUseCase.execute(req.user.profileId, id);
  }

  @Put('messages/:id')
  @UseGuards(OwnershipGuard)
  @RequireOwnership({ model: 'Message', userIdField: 'senderId' })
  async editMessage(@Param('id') id: string, @Body() body: EditMessageDto) {
    return this.editMessageUseCase.execute(id, body.content);
  }

  @Delete('messages/:id')
  @UseGuards(OwnershipGuard)
  @RequireOwnership({ model: 'Message', userIdField: 'senderId' })
  async deleteMessage(@Param('id') id: string) {
    return this.deleteMessageUseCase.execute(id);
  }
}
