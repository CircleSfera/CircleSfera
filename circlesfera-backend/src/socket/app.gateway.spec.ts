import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, type TestingModule } from '@nestjs/testing';
import type { Server, Socket } from 'socket.io';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatService } from '../chat/chat.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppGateway, type SocketWithAuth } from './app.gateway.js';

describe('AppGateway', () => {
  let gateway: AppGateway;

  const mockJwtService = {
    verifyAsync: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'test-secret';
      return null;
    }),
  };

  const mockPrismaService = {
    follow: {
      findMany: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    participant: {
      findFirst: vi.fn(),
    },
  };

  const mockChatService = {
    addReaction: vi.fn(),
  };

  const mockServer = {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  } as unknown as Server;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppGateway,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ChatService, useValue: mockChatService },
      ],
    }).compile();

    gateway = module.get<AppGateway>(AppGateway);
    gateway.server = mockServer;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should authenticate user and join rooms', async () => {
      const mockClient = {
        handshake: {
          headers: {
            cookie: 'access_token=valid-token',
          },
        },
        join: vi.fn(),
        data: {},
      } as unknown as Socket;

      const payload = { sub: 'user-1', email: 'test@example.com' };
      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockPrismaService.follow.findMany.mockResolvedValue([
        { followingId: 'user-2' },
      ]);
      mockPrismaService.user.update.mockResolvedValue({});

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
        secret: 'test-secret',
      });
      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(mockClient.join).toHaveBeenCalledWith(['presence:user-2']);
      expect(mockClient.join).toHaveBeenCalledWith('presence:user-1');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { isOnline: true },
      });
      expect(mockServer.to).toHaveBeenCalledWith('presence:user-1');
      expect(mockServer.emit).toHaveBeenCalledWith('user_status', {
        userId: 'user-1',
        isOnline: true,
      });
    });

    it('should disconnect if no token provided', async () => {
      const mockClient = {
        handshake: {
          headers: {},
        },
        disconnect: vi.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect if token invalid', async () => {
      const mockClient = {
        handshake: {
          headers: {
            authorization: 'Bearer invalid-token',
          },
        },
        disconnect: vi.fn(),
      } as unknown as Socket;

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should update user status to offline', async () => {
      const mockClient = {
        data: {
          user: { sub: 'user-1' },
        },
      } as unknown as Socket;

      await gateway.handleDisconnect(mockClient);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ isOnline: false }),
        }),
      );
      expect(mockServer.to).toHaveBeenCalledWith('presence:user-1');
      expect(mockServer.emit).toHaveBeenCalledWith(
        'user_status',
        expect.objectContaining({
          userId: 'user-1',
          isOnline: false,
        }),
      );
    });
  });

  describe('chat events', () => {
    const mockClient = {
      data: {
        user: { sub: 'sender-1' },
      },
    } as unknown as SocketWithAuth;

    it('should handle typing_start', async () => {
      const payload = { conversationId: 'conv-1', recipientId: 'recipient-1' };
      mockPrismaService.participant.findFirst.mockResolvedValue({
        id: 'part-1',
      });

      await gateway.handleTypingStart(payload, mockClient);

      expect(mockServer.to).toHaveBeenCalledWith('user:recipient-1');
      expect(mockServer.emit).toHaveBeenCalledWith('user_typing', {
        userId: 'sender-1',
        conversationId: 'conv-1',
      });
    });

    it('should handle send_reaction', async () => {
      const payload = {
        messageId: 'msg-1',
        recipientId: 'recipient-1',
        reaction: '👍',
      };
      mockChatService.addReaction.mockResolvedValue({ id: 'reaction-1' });

      await gateway.handleSendReaction(payload, mockClient);

      expect(mockChatService.addReaction).toHaveBeenCalledWith(
        'msg-1',
        'sender-1',
        '👍',
      );
      expect(mockServer.to).toHaveBeenCalledWith('user:recipient-1');
      expect(mockServer.emit).toHaveBeenCalledWith('message_reaction', {
        messageId: 'msg-1',
        userId: 'sender-1',
        reaction: '👍',
        id: 'reaction-1',
      });
    });
  });
});
