import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationsService } from '../../../../notifications/notifications.service.js';
import type { PrismaService } from '../../../../prisma/prisma.service.js';
import type { LogAdminActionUseCase } from './log-admin-action.use-case.js';
import { WarnLiveHostUseCase } from './warn-live-host.use-case.js';

describe('WarnLiveHostUseCase', () => {
  const prisma = {
    liveStream: { findUnique: vi.fn() },
    adminIdentity: { findUnique: vi.fn() },
  };
  const notifications = { create: vi.fn() };
  const log = { execute: vi.fn() };
  const useCase = new WarnLiveHostUseCase(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    log as unknown as LogAdminActionUseCase,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.adminIdentity.findUnique.mockResolvedValue({
      linkedUser: { profiles: [{ id: 'staff-profile' }] },
    });
    notifications.create.mockResolvedValue({});
  });

  it('tells the host of a broadcast on air why, and writes it in the audit log', async () => {
    prisma.liveStream.findUnique.mockResolvedValue({
      id: 'live-1',
      hostId: 'host-profile',
      status: 'LIVE',
    });

    await expect(
      useCase.execute('admin-1', 'live-1', 'Showing a phone number'),
    ).resolves.toEqual({ success: true });

    expect(log.execute).toHaveBeenCalledWith(
      'admin-1',
      'ACCOUNT_WARNED',
      'live_stream',
      'live-1',
      'Showing a phone number',
    );
    expect(notifications.create).toHaveBeenCalledWith({
      recipientId: 'host-profile',
      senderId: 'staff-profile',
      type: 'MODERATION',
      notice: { key: 'live_host_warned', reason: 'Showing a phone number' },
    });
  });

  it('sends the notice without a sender when the staff member has no profile', async () => {
    prisma.adminIdentity.findUnique.mockResolvedValue(null);
    prisma.liveStream.findUnique.mockResolvedValue({
      id: 'live-1',
      hostId: 'host-profile',
      status: 'LIVE',
    });

    await useCase.execute('admin-1', 'live-1', 'Too loud');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'host-profile',
        senderId: undefined,
      }),
    );
  });

  it('refuses a broadcast that does not exist', async () => {
    prisma.liveStream.findUnique.mockResolvedValue(null);

    await expect(
      useCase.execute('admin-1', 'gone', 'Too loud'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log.execute).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('refuses a broadcast that has ended', async () => {
    prisma.liveStream.findUnique.mockResolvedValue({
      id: 'live-1',
      hostId: 'host-profile',
      status: 'ENDED',
    });

    await expect(
      useCase.execute('admin-1', 'live-1', 'Too loud'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(log.execute).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
