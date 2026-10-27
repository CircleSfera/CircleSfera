import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveRecordingService } from '../../../../live/recording/live-recording.service.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import { EndLiveStreamUseCase } from './end-live-stream.use-case.js';
import type { LogAdminActionUseCase } from './log-admin-action.use-case.js';

describe('EndLiveStreamUseCase', () => {
  const prisma = {
    liveStream: { findUnique: vi.fn(), update: vi.fn() },
  };
  const log = { execute: vi.fn() };
  const recording = { stop: vi.fn() };
  const useCase = new EndLiveStreamUseCase(
    prisma as unknown as PrismaService,
    log as unknown as LogAdminActionUseCase,
    recording as unknown as LiveRecordingService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a broadcast that does not exist', async () => {
    prisma.liveStream.findUnique.mockResolvedValue(null);
    await expect(useCase.execute('admin-1', 'live-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers a broadcast already ended as it is', async () => {
    const ended = { id: 'live-1', status: 'ENDED' };
    prisma.liveStream.findUnique.mockResolvedValue(ended);
    await expect(useCase.execute('admin-1', 'live-1')).resolves.toBe(ended);
    expect(prisma.liveStream.update).not.toHaveBeenCalled();
  });

  it('ends it as ended by staff, invents no replay address and stops its recording', async () => {
    prisma.liveStream.findUnique.mockResolvedValue({
      id: 'live-1',
      status: 'LIVE',
      hlsUrl: null,
    });
    prisma.liveStream.update.mockResolvedValue({ id: 'live-1' });

    await useCase.execute('admin-1', 'live-1');

    expect(prisma.liveStream.update).toHaveBeenCalledWith({
      where: { id: 'live-1' },
      data: { status: 'ENDED', endedAt: expect.any(Date), endedByStaff: true },
    });
    expect(recording.stop).toHaveBeenCalledWith('live-1');
    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'MANUAL_OVERRIDE',
      'live_stream',
      'live-1',
      'Admin force-ended live stream',
    );
  });
});
