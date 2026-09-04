import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ChatController } from './chat.controller.js';
import { CreateGroupUseCase } from './use-cases/groups/create-group.use-case.js';
import { DeleteConversationUseCase } from './use-cases/groups/delete-conversation.use-case.js';
import { LeaveGroupUseCase } from './use-cases/groups/leave-group.use-case.js';
import { RemoveParticipantUseCase } from './use-cases/groups/remove-participant.use-case.js';
import { UpdateGroupUseCase } from './use-cases/groups/update-group.use-case.js';
import { DeleteMessageUseCase } from './use-cases/messages/delete-message.use-case.js';
import { EditMessageUseCase } from './use-cases/messages/edit-message.use-case.js';
import { MarkAsReadUseCase } from './use-cases/messages/mark-as-read.use-case.js';
import { SendMessageUseCase } from './use-cases/messages/send-message.use-case.js';
import { GetConversationsQuery } from './use-cases/queries/get-conversations.query.js';
import { GetMessagesQuery } from './use-cases/queries/get-messages.query.js';
import { GetUnreadCountQuery } from './use-cases/queries/get-unread-count.query.js';

describe('ChatController', () => {
  let controller: ChatController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const req = { user: mockUser } as Parameters<
    ChatController['getConversations']
  >[0];

  const mockGetConversationsQuery = { execute: vi.fn() };
  const mockGetMessagesQuery = { execute: vi.fn() };
  const mockGetUnreadCountQuery = { execute: vi.fn() };
  const mockSendMessageUseCase = { execute: vi.fn() };
  const mockEditMessageUseCase = { execute: vi.fn() };
  const mockDeleteMessageUseCase = { execute: vi.fn() };
  const mockMarkAsReadUseCase = { execute: vi.fn() };
  const mockCreateGroupUseCase = { execute: vi.fn() };
  const mockUpdateGroupUseCase = { execute: vi.fn() };
  const mockRemoveParticipantUseCase = { execute: vi.fn() };
  const mockLeaveGroupUseCase = { execute: vi.fn() };
  const mockDeleteConversationUseCase = { execute: vi.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: GetConversationsQuery, useValue: mockGetConversationsQuery },
        { provide: GetMessagesQuery, useValue: mockGetMessagesQuery },
        { provide: GetUnreadCountQuery, useValue: mockGetUnreadCountQuery },
        { provide: SendMessageUseCase, useValue: mockSendMessageUseCase },
        { provide: EditMessageUseCase, useValue: mockEditMessageUseCase },
        { provide: DeleteMessageUseCase, useValue: mockDeleteMessageUseCase },
        { provide: MarkAsReadUseCase, useValue: mockMarkAsReadUseCase },
        { provide: CreateGroupUseCase, useValue: mockCreateGroupUseCase },
        { provide: UpdateGroupUseCase, useValue: mockUpdateGroupUseCase },
        {
          provide: RemoveParticipantUseCase,
          useValue: mockRemoveParticipantUseCase,
        },
        { provide: LeaveGroupUseCase, useValue: mockLeaveGroupUseCase },
        {
          provide: DeleteConversationUseCase,
          useValue: mockDeleteConversationUseCase,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getConversations', () => {
    it('delegates to GetConversationsQuery with profileId', async () => {
      const conversations = [{ id: 'conv-1' }];
      mockGetConversationsQuery.execute.mockResolvedValue(conversations);

      const result = await controller.getConversations(req);

      expect(mockGetConversationsQuery.execute).toHaveBeenCalledWith(
        'profile-1',
      );
      expect(result).toEqual(conversations);
    });
  });

  describe('getUnreadCount', () => {
    it('returns unread count for profile', async () => {
      mockGetUnreadCountQuery.execute.mockResolvedValue(3);

      const result = await controller.getUnreadCount(req);

      expect(mockGetUnreadCountQuery.execute).toHaveBeenCalledWith('profile-1');
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('getMessages', () => {
    it('delegates to GetMessagesQuery with conversation id and profileId', async () => {
      const messages = [{ id: 'msg-1' }];
      mockGetMessagesQuery.execute.mockResolvedValue(messages);

      const result = await controller.getMessages(req, 'conv-1');

      expect(mockGetMessagesQuery.execute).toHaveBeenCalledWith(
        'conv-1',
        50,
        'profile-1',
      );
      expect(result).toEqual(messages);
    });
  });

  describe('sendMessage', () => {
    it('delegates to SendMessageUseCase with dto fields', async () => {
      const message = { id: 'msg-1', content: 'Hello' };
      mockSendMessageUseCase.execute.mockResolvedValue(message);

      const dto = {
        recipientId: 'profile-2',
        content: 'Hello',
        conversationId: 'conv-1',
        tempId: 'temp-1',
        mediaUrl: undefined,
        mediaType: undefined,
        postId: undefined,
        storyId: undefined,
        replyToId: undefined,
      };

      const result = await controller.sendMessage(req, dto);

      expect(mockSendMessageUseCase.execute).toHaveBeenCalledWith(
        'profile-1',
        'profile-2',
        'Hello',
        undefined,
        undefined,
        'conv-1',
        'temp-1',
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(message);
    });
  });

  describe('markRead', () => {
    it('marks conversation as read and returns success', async () => {
      mockMarkAsReadUseCase.execute.mockResolvedValue(undefined);

      const result = await controller.markRead(req, 'conv-1');

      expect(mockMarkAsReadUseCase.execute).toHaveBeenCalledWith(
        'conv-1',
        'profile-1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('editMessage', () => {
    it('delegates to EditMessageUseCase', async () => {
      const updated = { id: 'msg-1', content: 'Updated' };
      mockEditMessageUseCase.execute.mockResolvedValue(updated);

      const result = await controller.editMessage(req, 'msg-1', {
        content: 'Updated',
      });

      expect(mockEditMessageUseCase.execute).toHaveBeenCalledWith(
        'profile-1',
        'msg-1',
        'Updated',
      );
      expect(result).toEqual(updated);
    });
  });

  describe('deleteMessage', () => {
    it('delegates to DeleteMessageUseCase', async () => {
      mockDeleteMessageUseCase.execute.mockResolvedValue({ success: true });

      const result = await controller.deleteMessage(req, 'msg-1');

      expect(mockDeleteMessageUseCase.execute).toHaveBeenCalledWith(
        'profile-1',
        'msg-1',
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('createGroup', () => {
    it('delegates to CreateGroupUseCase', async () => {
      const group = { id: 'conv-1', name: 'Team' };
      mockCreateGroupUseCase.execute.mockResolvedValue(group);

      const result = await controller.createGroup(req, {
        participantIds: ['profile-2', 'profile-3'],
        name: 'Team',
      });

      expect(mockCreateGroupUseCase.execute).toHaveBeenCalledWith(
        'profile-1',
        ['profile-2', 'profile-3'],
        'Team',
      );
      expect(result).toEqual(group);
    });
  });

  describe('deleteConversation', () => {
    it('delegates to DeleteConversationUseCase ignoring mode query param', async () => {
      mockDeleteConversationUseCase.execute.mockResolvedValue({
        success: true,
      });

      const result = await controller.deleteConversation(req, 'conv-1', 'both');

      expect(mockDeleteConversationUseCase.execute).toHaveBeenCalledWith(
        'profile-1',
        'conv-1',
      );
      expect(result).toEqual({ success: true });
    });
  });
});
