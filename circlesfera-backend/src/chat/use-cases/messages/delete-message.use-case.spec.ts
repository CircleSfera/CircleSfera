import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../../../common/errors/app.exception.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { DeleteMessageUseCase } from './delete-message.use-case.js';

describe('DeleteMessageUseCase', () => {
  let useCase: DeleteMessageUseCase;
  let mockPrisma: {
    message: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let mockEventEmitter: { emit: ReturnType<typeof vi.fn> };
  let mockUploads: { releaseContentFiles: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockPrisma = {
      message: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    };
    mockEventEmitter = {
      emit: vi.fn(),
    };
    mockUploads = { releaseContentFiles: vi.fn().mockResolvedValue(undefined) };
    useCase = new DeleteMessageUseCase(
      mockPrisma as unknown as PrismaService,
      mockEventEmitter as unknown as EventEmitter2,
      mockUploads as never,
    );
  });

  it('throws NotFound if message does not exist', async () => {
    mockPrisma.message.findUnique.mockResolvedValue(null);

    await expect(useCase.execute('msg-1')).rejects.toThrow(AppException);
  });

  it('refuses to delete a notice from the app, even for the member it names', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'notice-1',
      kind: 'ADMIN_GRANTED',
      conversation: { participants: [] },
    });

    await expect(useCase.execute('notice-1')).rejects.toMatchObject({
      errorCode: 'MESSAGE_IS_NOTICE',
      status: 400,
    });
    expect(mockPrisma.message.update).not.toHaveBeenCalled();
    expect(mockEventEmitter.emit).not.toHaveBeenCalled();
  });

  it('soft deletes the message, clears every address of its files, emits the event and keeps its files for 30 days', async () => {
    const participants = [
      { profileId: 'profile-1' },
      { profileId: 'profile-2' },
    ];
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'profile-1',
      url: null,
      standardUrl: '/uploads/v/master.m3u8',
      thumbnailUrl: '/uploads/v/thumb.jpg',
      voiceUrl: '/uploads/voice.webm',
      media: {
        url: '/uploads/v.mp4',
        standardUrl: '/uploads/v/master.m3u8',
        thumbnailUrl: '/uploads/v/thumb.jpg',
      },
      voiceMedia: { url: '/uploads/voice.webm' },
      conversation: { participants },
    });

    const updatedMessage = {
      id: 'msg-1',
      content: '',
      isDeleted: true,
      url: null,
      mediaType: null,
      sender: { id: 'profile-1', username: 'user1' },
    };
    mockPrisma.message.update.mockResolvedValue(updatedMessage);

    const result = await useCase.execute('msg-1');

    expect(result).toEqual({ success: true, message: updatedMessage });
    expect(mockPrisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: {
        content: '',
        isDeleted: true,
        url: null,
        standardUrl: null,
        thumbnailUrl: null,
        mediaType: null,
        mediaId: null,
        voiceUrl: null,
        voiceDuration: null,
        voiceWaveform: Prisma.DbNull,
        voiceMediaId: null,
      },
      include: expect.any(Object),
    });
    expect(mockUploads.releaseContentFiles).toHaveBeenCalledWith([
      null,
      '/uploads/v/master.m3u8',
      '/uploads/v/thumb.jpg',
      '/uploads/voice.webm',
      '/uploads/v.mp4',
      '/uploads/v/master.m3u8',
      '/uploads/v/thumb.jpg',
      '/uploads/voice.webm',
    ]);
    // The row is cleared before any file goes.
    expect(mockPrisma.message.update.mock.invocationCallOrder[0]).toBeLessThan(
      mockUploads.releaseContentFiles.mock.invocationCallOrder[0],
    );
    expect(mockEventEmitter.emit).toHaveBeenCalledWith('chat.message.deleted', {
      participants,
      payload: { messageId: 'msg-1' },
    });
  });

  it('still deletes the message when its files cannot be deleted', async () => {
    mockPrisma.message.findUnique.mockResolvedValue({
      id: 'msg-1',
      senderId: 'profile-1',
      url: '/uploads/a.jpg',
      conversation: { participants: [] },
    });
    mockPrisma.message.update.mockResolvedValue({ id: 'msg-1' });
    mockUploads.releaseContentFiles.mockRejectedValue(new Error('disk'));

    await expect(useCase.execute('msg-1')).resolves.toMatchObject({
      success: true,
    });
  });
});
