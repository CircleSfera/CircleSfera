import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { PushService } from '../../../push/push.service.js';
import { SendMessageUseCase } from './send-message.use-case.js';

describe('SendMessageUseCase', () => {
  let useCase: SendMessageUseCase;
  let mockPrisma: any;
  let mockTx: any;
  let mockCryptoService: {
    encrypt: ReturnType<typeof vi.fn>;
  };
  let mockPushService: {
    sendNotification: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockTx = {
      conversation: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
      },
      block: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        create: vi.fn(),
      },
      participant: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockPrisma = {
      $transaction: vi.fn(async (cb: any) => cb(mockTx)),
      profile: {
        findUnique: vi.fn(),
      },
    };

    mockCryptoService = {
      encrypt: vi.fn((c: string) => `encrypted_${c}`),
    };

    mockPushService = {
      sendNotification: vi.fn().mockResolvedValue(true),
    };

    mockEventEmitter = {
      emit: vi.fn(),
    };

    useCase = new SendMessageUseCase(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
      mockPushService as unknown as PushService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws BadRequest when neither conversationId nor recipientId is provided', async () => {
    await expect(
      useCase.execute('sender-1', undefined, 'Hello'),
    ).rejects.toThrow(AppException);
  });

  it('throws NotFound if conversationId does not exist', async () => {
    mockTx.conversation.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-nonexistent',
      ),
    ).rejects.toThrow(AppException);
  });

  it('throws Forbidden if sender is not participant in conversation', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [
        { profileId: 'other-user', profile: { id: 'other-user' } },
      ],
    });

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('throws Forbidden if participant is blocked or blocks sender', async () => {
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
      ],
    });
    mockTx.block.findMany.mockResolvedValue([{ id: 'block-1' }]);

    await expect(
      useCase.execute(
        'sender-1',
        undefined,
        'Hello',
        undefined,
        undefined,
        'conv-1',
      ),
    ).rejects.toThrow(AppException);
  });

  it('sends message to existing conversation with push notification to recipient', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    const createdMsg = {
      id: 'msg-1',
      content: 'encrypted_Hello',
      senderId: 'sender-1',
      conversationId: 'conv-1',
      sender: { id: 'sender-1', username: 'sender_user' },
    };
    mockTx.message.create.mockResolvedValue(createdMsg);

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Hello',
      'https://media.jpg',
      'image',
      'conv-1',
      'temp-123',
    );

    expect(result).toMatchObject({
      id: 'msg-1',
      content: 'Hello',
      tempId: 'temp-123',
    });
    expect(mockCryptoService.encrypt).toHaveBeenCalledWith('Hello');
    expect(mockTx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: 'encrypted_Hello',
          senderId: 'sender-1',
          conversationId: 'conv-1',
          url: 'https://media.jpg',
          mediaType: 'image',
        }),
      }),
    );
    expect(mockTx.participant.updateMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conv-1',
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    });
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.sent', {
      participants,
      payload: expect.objectContaining({
        content: 'Hello',
        tempId: 'temp-123',
      }),
    });
    expect(mockPushService.sendNotification).toHaveBeenCalledWith(
      'recipient-1',
      expect.objectContaining({
        title: 'Nuevo mensaje cifrado',
        data: { url: '/chat/conv-1', type: 'chat' },
      }),
    );
  });

  it('sends message creating direct conversation when not found', async () => {
    mockTx.conversation.findFirst.mockResolvedValue(null);
    const newConv = {
      id: 'conv-created',
      participants: [{ profileId: 'sender-1' }, { profileId: 'recipient-2' }],
    };
    mockTx.conversation.create.mockResolvedValue(newConv);
    mockTx.message.create.mockResolvedValue({
      id: 'msg-2',
      content: 'encrypted_Direct',
      senderId: 'sender-1',
      conversationId: 'conv-created',
      sender: { id: 'sender-1', username: 'direct_sender' },
    });

    const result = await useCase.execute('sender-1', 'recipient-2', 'Direct');

    expect(mockTx.conversation.create).toHaveBeenCalledWith({
      data: {
        isGroup: false,
        participants: {
          create: [{ profileId: 'sender-1' }, { profileId: 'recipient-2' }],
        },
      },
      include: { participants: true },
    });
    expect(result.content).toBe('Direct');
  });

  it('sends message finding direct conversation when it exists', async () => {
    const existingConv = {
      id: 'conv-existing',
      participants: [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-2', profile: { id: 'recipient-2' } },
      ],
    };
    mockTx.conversation.findFirst.mockResolvedValue(existingConv);
    mockTx.message.create.mockResolvedValue({
      id: 'msg-3',
      content: 'encrypted_Hi',
      senderId: 'sender-1',
      conversationId: 'conv-existing',
      sender: { id: 'sender-1' },
    });

    const result = await useCase.execute(
      'sender-1',
      'recipient-2',
      'Hi',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'voice.mp3',
      12,
      [0.1, 0.5, 0.9],
    );

    expect(mockTx.conversation.create).not.toHaveBeenCalled();
    expect(result.content).toBe('Hi');
  });

  it('handles push error gracefully without failing message send', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
      { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-4',
      content: 'encrypted_Test',
      senderId: 'sender-1',
      sender: { id: 'sender-1', username: 'sender' },
    });
    mockPushService.sendNotification.mockRejectedValue(
      new Error('Push token expired'),
    );

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Test',
      undefined,
      undefined,
      'conv-1',
    );

    expect(result.content).toBe('Test');
  });

  it('handles socket emit exception gracefully', async () => {
    const participants = [
      { profileId: 'sender-1', profile: { id: 'sender-1' } },
    ];
    mockTx.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      participants,
    });
    mockTx.message.create.mockResolvedValue({
      id: 'msg-5',
      content: 'encrypted_Test',
      senderId: 'sender-1',
      sender: { id: 'sender-1' },
    });
    mockEventEmitter.emit.mockImplementation(() => {
      throw new Error('Socket failure');
    });

    const result = await useCase.execute(
      'sender-1',
      undefined,
      'Test',
      undefined,
      undefined,
      'conv-1',
    );

    expect(result.content).toBe('Test');
  });

  describe('locked (PPV) messages', () => {
    it('rejects a locked message from a PERSONAL account before touching the conversation', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        accountType: 'PERSONAL',
      });

      await expect(
        useCase.execute(
          'sender-1',
          undefined,
          'Hello',
          undefined,
          undefined,
          'conv-1',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          500,
        ),
      ).rejects.toThrow(AppException);
      expect(mockTx.conversation.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a locked message priced below the €5.00 floor', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        accountType: 'CREATOR',
      });

      await expect(
        useCase.execute(
          'sender-1',
          undefined,
          'Hello',
          undefined,
          undefined,
          'conv-1',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          100,
        ),
      ).rejects.toThrow(AppException);
    });

    it('rejects a locked message priced above the €500.00 ceiling', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        accountType: 'BUSINESS',
      });

      await expect(
        useCase.execute(
          'sender-1',
          undefined,
          'Hello',
          undefined,
          undefined,
          'conv-1',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          100_000,
        ),
      ).rejects.toThrow(AppException);
    });

    it('creates a locked message with isLocked/priceCents for an eligible CREATOR account', async () => {
      mockPrisma.profile.findUnique.mockResolvedValue({
        accountType: 'CREATOR',
      });
      const participants = [
        { profileId: 'sender-1', profile: { id: 'sender-1' } },
        { profileId: 'recipient-1', profile: { id: 'recipient-1' } },
      ];
      mockTx.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participants,
      });
      mockTx.message.create.mockResolvedValue({
        id: 'msg-locked',
        content: 'encrypted_Unlock me',
        senderId: 'sender-1',
        conversationId: 'conv-1',
        isLocked: true,
        priceCents: 999,
        sender: { id: 'sender-1', username: 'creator_user' },
      });

      const result = await useCase.execute(
        'sender-1',
        undefined,
        'Unlock me',
        undefined,
        undefined,
        'conv-1',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        999,
      );

      expect(mockTx.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isLocked: true, priceCents: 999 }),
        }),
      );
      expect(result).toMatchObject({ id: 'msg-locked', content: 'Unlock me' });
    });

    it('never sets isLocked/priceCents on a normal (non-locked) message', async () => {
      mockTx.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        participants: [{ profileId: 'sender-1', profile: { id: 'sender-1' } }],
      });
      mockTx.message.create.mockResolvedValue({
        id: 'msg-plain',
        content: 'encrypted_Hi',
        senderId: 'sender-1',
        sender: { id: 'sender-1' },
      });

      await useCase.execute(
        'sender-1',
        undefined,
        'Hi',
        undefined,
        undefined,
        'conv-1',
      );

      expect(mockPrisma.profile.findUnique).not.toHaveBeenCalled();
      const createCall = mockTx.message.create.mock.calls[0][0];
      expect(createCall.data).not.toHaveProperty('isLocked');
      expect(createCall.data).not.toHaveProperty('priceCents');
    });
  });
});
