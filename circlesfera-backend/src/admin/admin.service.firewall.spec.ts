import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SystemSettingsService } from '../system-settings/system-settings.service.js';
import { AdminService } from './admin.service.js';

describe('AdminService — rules of the AI shield', () => {
  const prisma = {
    moderationRule: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    adminAuditLog: { create: vi.fn() },
  };
  const service = new AdminService(
    prisma as unknown as PrismaService,
    {} as Queue,
    {} as Queue,
    {} as SystemSettingsService,
  );
  const known = (code: string) => Object.assign(new Error(code), { code });

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.adminAuditLog.create.mockResolvedValue({});
  });

  it('creates a rule that sends to review and is on unless told otherwise', async () => {
    prisma.moderationRule.create.mockResolvedValue({ id: 'r1' });

    await service.createFirewallRule('admin-1', { keyword: 'casino' });
    await service.createFirewallRule('admin-1', {
      keyword: 'crypto',
      action: 'BLOCK',
      isActive: false,
    });

    expect(prisma.moderationRule.create).toHaveBeenNthCalledWith(1, {
      data: {
        keyword: 'casino',
        action: 'FLAG',
        isActive: true,
        createdBy: 'admin-1',
      },
    });
    expect(prisma.moderationRule.create).toHaveBeenNthCalledWith(2, {
      data: {
        keyword: 'crypto',
        action: 'BLOCK',
        isActive: false,
        createdBy: 'admin-1',
      },
    });
    expect(prisma.adminAuditLog.create).toHaveBeenCalledTimes(2);
  });

  it('refuses a second rule for the same phrase as a conflict, and logs nothing', async () => {
    prisma.moderationRule.create.mockRejectedValue(known('P2002'));

    await expect(
      service.createFirewallRule('admin-1', { keyword: 'casino' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it('lets any other failure of the database through as it is', async () => {
    const down = known('P1001');
    prisma.moderationRule.create.mockRejectedValue(down);
    prisma.moderationRule.update.mockRejectedValue(down);
    prisma.moderationRule.delete.mockRejectedValue(down);

    await expect(
      service.createFirewallRule('admin-1', { keyword: 'casino' }),
    ).rejects.toBe(down);
    await expect(
      service.updateFirewallRule('admin-1', 'r1', { isActive: false }),
    ).rejects.toBe(down);
    await expect(service.deleteFirewallRule('admin-1', 'r1')).rejects.toBe(
      down,
    );
  });

  it('changes what a rule does or its state, and refuses an empty change', async () => {
    prisma.moderationRule.update.mockResolvedValue({ id: 'r1' });

    await service.updateFirewallRule('admin-1', 'r1', { isActive: false });
    expect(prisma.moderationRule.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { action: undefined, isActive: false },
    });

    await expect(
      service.updateFirewallRule('admin-1', 'r1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.moderationRule.update).toHaveBeenCalledTimes(1);
  });

  it('says a rule is not found when it was deleted meanwhile', async () => {
    prisma.moderationRule.update.mockRejectedValue(known('P2025'));
    prisma.moderationRule.delete.mockRejectedValue(known('P2025'));

    await expect(
      service.updateFirewallRule('admin-1', 'gone', { action: 'MUTE' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.deleteFirewallRule('admin-1', 'gone'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
  });
});
