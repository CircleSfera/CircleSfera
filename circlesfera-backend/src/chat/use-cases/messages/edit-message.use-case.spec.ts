import { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { CryptoService } from '../../../common/services/crypto.service.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { EditMessageUseCase } from './edit-message.use-case.js';

describe('EditMessageUseCase', () => {
  let useCase: EditMessageUseCase;
  let mockPrisma: {
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockCryptoService: {
    encrypt: ReturnType<typeof vi.fn>;
  };
  let mockEventEmitter: {
    emit: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPrisma = {
      message: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    mockCryptoService = {
      encrypt: vi.fn((val: string) => `enc_${val}`),
    };
    mockEventEmitter = {
      emit: vi.fn(),
    };
    useCase = new EditMessageUseCase(
      mockPrisma as unknown as PrismaService,
      mockCryptoService as unknown as CryptoService,
      mockEventEmitter as unknown as EventEmitter2,
    );
  });

  it('throws NotFound if message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute('prof-1', 'msg-1', 'new text'),
    ).rejects.toThrow(AppException);
  });

  it('throws Forbidden if caller is not the message sender', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'other-user',
      conversation: { participants: [] },
    });

    await expect(
      useCase.execute('prof-1', 'msg-1', 'new text'),
    ).rejects.toThrow(AppException);
  });

  it('throws BadRequest if message is deleted', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'prof-1',
      isDeleted: true,
      conversation: { participants: [] },
    });

    await expect(
      useCase.execute('prof-1', 'msg-1', 'new text'),
    ).rejects.toThrow(AppException);
  });

  it('encrypts content, updates message, emits event, and returns decrypted text', async () => {
    const participants = [{ profileId: 'prof-1' }, { profileId: 'prof-2' }];
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'prof-1',
      isDeleted: false,
      conversation: { participants },
    });

    const updatedRecord = {
      id: 'msg-1',
      content: 'enc_new text',
      isEdited: true,
      sender: { id: 'prof-1', username: 'user1' },
    };
    mockPrisma.message.update.mockResolvedValue({ ...updatedRecord });

    const result = await useCase.execute('prof-1', 'msg-1', 'new text');

    expect(mockCryptoService.encrypt).toHaveBeenCalledWith('new text');
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: {
        content: 'enc_new text',
        isEdited: true,
      },
      include: expect.any(Object),
    });
    expect(result.content).toBe('new text');
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.edited', {
      participants,
      payload: expect.objectContaining({
        content: 'new text',
        isEdited: true,
      }),
    });
  });
});
