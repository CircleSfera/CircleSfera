import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CryptoService } from '../common/services/crypto.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PushService } from '../push/push.service.js';
import { AppGateway } from '../socket/app.gateway.js';
import { ChatService } from './chat.service.js';

describe('ChatService', () => {
  let service: ChatService;

  const mockPrismaService = {
    conversation: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    participant: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    messageReaction: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
  };

  const mockEmit = vi.fn();
  const mockTo = vi.fn(() => ({ emit: mockEmit }));

  const mockCryptoService = {
    encrypt: vi.fn((txt) => txt),
    decrypt: vi.fn((txt) => txt),
  };

  const mockModuleRef = {
    get: vi.fn((type) => {
      if (type === AppGateway) {
        return {
          server: {
            to: mockTo,
          },
        };
      }
      return null;
    }),
  };

  const mockPushService = {
    sendNotification: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ModuleRef, useValue: mockModuleRef },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: PushService, useValue: mockPushService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
    vi.clearAllMocks();
  });

  describe('Instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('createGroup', () => {
    it('should throw BadRequestException if creating with only yourself', async () => {
      await expect(service.createGroup('userA', ['userA'])).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return existing 1-on-1 conversation if it exists', async () => {
      const existing = { id: 'conv-1', isGroup: false };
      mockPrismaService.conversation.findFirst.mockResolvedValueOnce(existing);
      mockPrismaService.block.findMany.mockResolvedValueOnce([]);

      const result = await service.createGroup('userA', ['userA', 'userB']);
      expect(result).toEqual(existing);
      expect(mockPrismaService.conversation.findFirst).toHaveBeenCalled();
      expect(mockPrismaService.conversation.create).not.toHaveBeenCalled();
    });

    it('should create new 1-on-1 conversation if none exists', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.conversation.create.mockResolvedValueOnce({
        id: 'conv-2',
      });
      mockPrismaService.block.findMany.mockResolvedValueOnce([]);

      const result = await service.createGroup('userA', ['userA', 'userB']);
      expect(result).toEqual({ id: 'conv-2' });
      expect(mockPrismaService.conversation.create).toHaveBeenCalled();
    });

    it('should create a true group conversation if multiple participants', async () => {
      mockPrismaService.conversation.create.mockResolvedValueOnce({
        id: 'conv-group',
      });
      mockPrismaService.block.findMany.mockResolvedValueOnce([]);

      const result = await service.createGroup(
        'userA',
        ['userA', 'userB', 'userC'],
        'My Group',
      );

      expect(result).toEqual({ id: 'conv-group' });
      expect(mockPrismaService.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isGroup: true,
            name: 'My Group',
          }),
        }),
      );
    });
  });

  describe('sendMessage', () => {
    it('should throw NotFoundException if conversationId passed but not found', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.sendMessage(
          'userA',
          undefined,
          'Hello',
          undefined,
          undefined,
          'conv-X',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if sender is not participant of existing conv', async () => {
      mockPrismaService.conversation.findUnique.mockResolvedValueOnce({
        id: 'conv-X',
        participants: [{ userId: 'userB' }],
      });
      await expect(
        service.sendMessage(
          'userA',
          undefined,
          'Hello',
          undefined,
          undefined,
          'conv-X',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if no convId and no recipientId', async () => {
      await expect(
        service.sendMessage('userA', undefined, 'Hello'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should find or create DM conv and send message with Gateway broadcast', async () => {
      mockPrismaService.conversation.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.conversation.create.mockResolvedValueOnce({
        id: 'new-dm-id',
        participants: [{ userId: 'userA' }, { userId: 'userB' }],
      });
      mockPrismaService.message.create.mockResolvedValueOnce({
        id: 'msg-1',
        content: 'Hi Bob',
        sender: { profile: { username: 'userA' } },
      });
      mockPrismaService.block.findMany.mockResolvedValueOnce([]);

      const result = await service.sendMessage(
        'userA',
        'userB',
        'Hi Bob',
        undefined,
        undefined,
        undefined,
        'temp-xyz123',
      );

      expect(result.id).toBe('msg-1');
      expect(mockPrismaService.message.create).toHaveBeenCalled();
      expect(mockTo).toHaveBeenCalledWith('user:userA');
      expect(mockTo).toHaveBeenCalledWith('user:userB');
      expect(mockEmit).toHaveBeenCalledWith(
        'receiveMessage',
        expect.objectContaining({
          id: 'msg-1',
          content: 'Hi Bob',
          tempId: 'temp-xyz123',
          sender: { profile: { username: 'userA' } },
        }),
      );
    });

    it('should use existing conversationId and send message correctly', async () => {
      const fakeConv = {
        id: 'conv-existing',
        participants: [{ userId: 'userA' }, { userId: 'userC' }],
      };
      mockPrismaService.conversation.findUnique.mockResolvedValueOnce(fakeConv);
      mockPrismaService.message.create.mockResolvedValueOnce({
        id: 'msg-2',
        content: 'ping',
        sender: { profile: { username: 'userA' } },
      });
      mockPrismaService.block.findMany.mockResolvedValueOnce([]);

      const result = await service.sendMessage(
        'userA',
        undefined,
        'ping',
        undefined,
        undefined,
        'conv-existing',
      );
      expect(result.id).toBe('msg-2');
      expect(mockPrismaService.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId: 'conv-existing' }),
        }),
      );
    });
  });

  describe('markAsRead', () => {
    it('should update participant lastReadAt', async () => {
      mockPrismaService.participant.updateMany.mockResolvedValueOnce({
        count: 1,
      });
      await service.markAsRead('conv-1', 'userA');
      expect(mockPrismaService.participant.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conv-1', userId: 'userA' },
        }),
      );
    });
  });

  describe('getConversations', () => {
    it('should return conversations for user', async () => {
      mockPrismaService.conversation.findMany.mockResolvedValueOnce([
        { id: 'c1' },
      ]);
      const result = await service.getConversations('userA');
      expect(result).toHaveLength(1);
      expect(mockPrismaService.conversation.findMany).toHaveBeenCalled();
    });
  });

  describe('getMessages', () => {
    it('should throw ForbiddenException if userId provided but not a participant', async () => {
      mockPrismaService.participant.findFirst.mockResolvedValueOnce(null);
      await expect(service.getMessages('c1', 50, 'userA')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return messages if valid participant', async () => {
      mockPrismaService.participant.findFirst.mockResolvedValueOnce({
        id: 'p1',
      });
      mockPrismaService.message.findMany.mockResolvedValueOnce([
        { id: 'm1' },
        { id: 'm2' },
      ]);
      const result = await service.getMessages('c1', 50, 'userA');
      expect(result).toHaveLength(2);
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: 'c1' } }),
      );
    });

    it('should return messages if no userId validation is requested', async () => {
      mockPrismaService.message.findMany.mockResolvedValueOnce([{ id: 'm1' }]);
      const result = await service.getMessages('c1');
      expect(result).toHaveLength(1);
    });
  });

  describe('addReaction', () => {
    it('should delete reaction (toggle OFF) if exact same emoji is sent again', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        conversation: {
          participants: [{ userId: 'userA' }],
        },
      });
      mockPrismaService.messageReaction.findUnique.mockResolvedValueOnce({
        id: 'react-1',
        reaction: '❤️',
      });
      mockPrismaService.messageReaction.delete.mockResolvedValueOnce({
        id: 'react-1',
      });

      const result = await service.addReaction('msg-1', 'userA', '❤️');
      expect(result.reaction).toBeNull();
      expect(mockPrismaService.messageReaction.delete).toHaveBeenCalledWith({
        where: { id: 'react-1' },
      });
    });

    it('should update reaction if a different emoji already exists', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        conversation: {
          participants: [{ userId: 'userA' }],
        },
      });
      mockPrismaService.messageReaction.findUnique.mockResolvedValueOnce({
        id: 'react-1',
        reaction: '👍',
      });
      mockPrismaService.messageReaction.update.mockResolvedValueOnce({
        id: 'react-1',
        reaction: '❤️',
      });

      const result = await service.addReaction('msg-1', 'userA', '❤️');
      expect(result.reaction).toBe('❤️');
      expect(mockPrismaService.messageReaction.update).toHaveBeenCalled();
    });

    it('should create reaction if it does not exist', async () => {
      mockPrismaService.message.findUnique.mockResolvedValueOnce({
        id: 'msg-1',
        conversation: {
          participants: [{ userId: 'userA' }],
        },
      });
      mockPrismaService.messageReaction.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.messageReaction.create.mockResolvedValueOnce({
        id: 'reaction-new',
        reaction: '🔥',
      });

      const result = await service.addReaction('msg-1', 'userA', '🔥');
      expect(result.reaction).toBe('🔥');
      expect(mockPrismaService.messageReaction.create).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return 0 if there are no conversations', async () => {
      mockPrismaService.conversation.findMany.mockResolvedValueOnce([]);
      const result = await service.getUnreadCount('userA');
      expect(result).toBe(0);
    });

    it('should return 0 if the last message is from the current user', async () => {
      const mockConv = {
        id: 'c1',
        messages: [{ senderId: 'userA', createdAt: new Date() }],
        participants: [{ userId: 'userA', lastReadAt: new Date() }],
      };
      mockPrismaService.conversation.findMany.mockResolvedValueOnce([mockConv]);
      const result = await service.getUnreadCount('userA');
      expect(result).toBe(0);
    });

    it('should return 1 if the last message is from another user and newer than lastReadAt', async () => {
      const mockConv = {
        id: 'c1',
        messages: [
          { senderId: 'userB', createdAt: new Date(Date.now() + 5000) },
        ],
        participants: [{ userId: 'userA', lastReadAt: new Date() }],
      };
      mockPrismaService.conversation.findMany.mockResolvedValueOnce([mockConv]);
      const result = await service.getUnreadCount('userA');
      expect(result).toBe(1);
    });

    it('should return 0 if the last message is older than lastReadAt', async () => {
      const mockConv = {
        id: 'c1',
        messages: [
          { senderId: 'userB', createdAt: new Date(Date.now() - 5000) },
        ],
        participants: [{ userId: 'userA', lastReadAt: new Date() }],
      };
      mockPrismaService.conversation.findMany.mockResolvedValueOnce([mockConv]);
      const result = await service.getUnreadCount('userA');
      expect(result).toBe(0);
    });
  });

  describe('deleteConversation', () => {
    it('should throw ForbiddenException if user is not participant before deletion', async () => {
      mockPrismaService.participant.findFirst.mockResolvedValueOnce(null);
      await expect(service.deleteConversation('c1', 'userA')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should delete conversation and emit deletion event to participants', async () => {
      mockPrismaService.participant.findFirst.mockResolvedValueOnce({
        id: 'p-1',
      });
      mockPrismaService.participant.update.mockResolvedValueOnce({
        id: 'p-1',
      });

      const result = await service.deleteConversation('c1', 'userA');
      expect(result.success).toBe(true);
      expect(result.mode).toBe('me');
      expect(mockTo).toHaveBeenCalledWith('user:userA');
    });
  });
});
