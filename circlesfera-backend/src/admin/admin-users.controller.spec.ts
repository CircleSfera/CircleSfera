import { Test, type TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';

describe('AdminUsersController', () => {
  let controller: AdminUsersController;

  const admin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['users.read', 'users.write', 'users.ban', 'system'],
    roles: ['ADMIN'],
    userId: 'admin-1',
  };

  const mockService = {
    sendBroadcastEmail: vi.fn(),
    exportUsersCSV: vi.fn(),
    getUsers: vi.fn(),
    getKycStats: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    updateUserRole: vi.fn(),
    updateUserStatus: vi.fn(),
    revokeUserKYC: vi.fn(),
    syncUserKYC: vi.fn(),
    deleteUser: vi.fn(),
    getWhitelist: vi.fn(),
    createWhitelist: vi.fn(),
    updateWhitelist: vi.fn(),
    deleteWhitelist: vi.fn(),
    warnUser: vi.fn(),
    suspendUser: vi.fn(),
    restoreUser: vi.fn(),
    getUserDetail: vi.fn(),
    getLinkedAccounts: vi.fn(),
    getTrustScore: vi.fn(),
    applyBotLabel: vi.fn(),
    clearBotLabel: vi.fn(),
    getSignupFunnelStats: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminUsersController>(AdminUsersController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists users with the query fields and no actor', async () => {
    mockService.getUsers.mockResolvedValue({ data: [] });
    const query = {
      page: 2,
      limit: 20,
      search: 'ada',
      status: 'ACTIVE',
      role: 'USER',
      kycStatus: 'verified' as const,
    };

    await controller.getUsers(query);

    expect(mockService.getUsers).toHaveBeenCalledWith(
      2,
      20,
      'ada',
      'ACTIVE',
      'USER',
      'verified',
    );
  });

  it('reads KYC, detail, linked accounts, trust and funnel without adminId', async () => {
    mockService.getKycStats.mockResolvedValue({});
    mockService.getUserDetail.mockResolvedValue({ id: 'user-2' });
    mockService.getLinkedAccounts.mockResolvedValue([]);
    mockService.getTrustScore.mockResolvedValue({ score: 1 });
    mockService.getSignupFunnelStats.mockResolvedValue({});

    await controller.getKycStats();
    await controller.getUserDetail('user-2');
    await controller.getLinkedAccounts('user-2');
    await controller.getTrustScore('user-2');
    await controller.getSignupFunnel();

    expect(mockService.getKycStats).toHaveBeenCalledWith();
    expect(mockService.getUserDetail).toHaveBeenCalledWith('user-2');
    expect(mockService.getLinkedAccounts).toHaveBeenCalledWith('user-2');
    expect(mockService.getTrustScore).toHaveBeenCalledWith('user-2');
    expect(mockService.getSignupFunnelStats).toHaveBeenCalledWith();
  });

  it('exports users CSV without an actor', async () => {
    const res = {
      setHeader: vi.fn(),
      send: vi.fn(),
    } as unknown as Response;
    mockService.exportUsersCSV.mockResolvedValue('id,email\n');

    await controller.exportUsersCSV(res);

    expect(mockService.exportUsersCSV).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send).toHaveBeenCalledWith('id,email\n');
  });

  it('broadcasts as adminId', async () => {
    const dto = { subject: 'Hello', title: 'Hi', content: 'Body' };
    mockService.sendBroadcastEmail.mockResolvedValue({ ok: true });

    await controller.sendBroadcast(dto, admin);

    expect(mockService.sendBroadcastEmail).toHaveBeenCalledWith('admin-1', dto);
  });

  it('bans, unbans and deletes as adminId', async () => {
    mockService.banUser.mockResolvedValue({ id: 'user-2' });
    mockService.unbanUser.mockResolvedValue({ id: 'user-2' });
    mockService.deleteUser.mockResolvedValue({ ok: true });

    await controller.banUser('user-2', admin);
    await controller.unbanUser('user-2', admin);
    await controller.deleteUser('user-2', admin);

    expect(mockService.banUser).toHaveBeenCalledWith('admin-1', 'user-2');
    expect(mockService.unbanUser).toHaveBeenCalledWith('admin-1', 'user-2');
    expect(mockService.deleteUser).toHaveBeenCalledWith('admin-1', 'user-2');
  });

  it('updates role, status and KYC as adminId', async () => {
    const status = { isActive: false };
    mockService.updateUserRole.mockResolvedValue({ id: 'user-2' });
    mockService.updateUserStatus.mockResolvedValue({ id: 'user-2' });
    mockService.revokeUserKYC.mockResolvedValue({ id: 'user-2' });
    mockService.syncUserKYC.mockResolvedValue({ id: 'user-2' });

    await controller.updateUserRole('user-2', { role: 'MODERATOR' }, admin);
    await controller.updateUserStatus('user-2', status, admin);
    await controller.revokeUserKYC('user-2', admin);
    await controller.syncUserKYC('user-2', admin);

    expect(mockService.updateUserRole).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      'MODERATOR',
    );
    expect(mockService.updateUserStatus).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      status,
    );
    expect(mockService.revokeUserKYC).toHaveBeenCalledWith('admin-1', 'user-2');
    expect(mockService.syncUserKYC).toHaveBeenCalledWith('admin-1', 'user-2');
  });

  it('lists whitelist with defaults and mutates as adminId', async () => {
    const createDto = { email: 'invite@example.com' };
    const updateDto = { status: 'REGISTERED' as const };
    mockService.getWhitelist.mockResolvedValue({ data: [] });
    mockService.createWhitelist.mockResolvedValue({ id: 'wl-1' });
    mockService.updateWhitelist.mockResolvedValue({ id: 'wl-1' });
    mockService.deleteWhitelist.mockResolvedValue({ ok: true });

    await controller.getWhitelist({});
    await controller.createWhitelist(createDto, admin);
    await controller.updateWhitelist('wl-1', updateDto, admin);
    await controller.deleteWhitelist('wl-1', admin);

    expect(mockService.getWhitelist).toHaveBeenCalledWith(1, 10, undefined);
    expect(mockService.createWhitelist).toHaveBeenCalledWith(
      'admin-1',
      createDto,
    );
    expect(mockService.updateWhitelist).toHaveBeenCalledWith(
      'admin-1',
      'wl-1',
      updateDto,
    );
    expect(mockService.deleteWhitelist).toHaveBeenCalledWith('admin-1', 'wl-1');
  });

  it('warns, suspends with default days, and restores as adminId', async () => {
    mockService.warnUser.mockResolvedValue({ id: 'user-2' });
    mockService.suspendUser.mockResolvedValue({ id: 'user-2' });
    mockService.restoreUser.mockResolvedValue({ id: 'user-2' });

    await controller.warnUser('user-2', 'spam', admin);
    await controller.suspendUser('user-2', { reason: 'abuse' }, admin);
    await controller.suspendUser('user-2', { days: 3, reason: 'abuse' }, admin);
    await controller.restoreSuspendedUser('user-2', admin);

    expect(mockService.warnUser).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      'spam',
    );
    expect(mockService.suspendUser).toHaveBeenNthCalledWith(
      1,
      'admin-1',
      'user-2',
      7,
      'abuse',
    );
    expect(mockService.suspendUser).toHaveBeenNthCalledWith(
      2,
      'admin-1',
      'user-2',
      3,
      'abuse',
    );
    expect(mockService.restoreUser).toHaveBeenCalledWith('admin-1', 'user-2');
  });

  it('applies and clears a bot label as adminId', async () => {
    mockService.applyBotLabel.mockResolvedValue({ id: 'user-2' });
    mockService.clearBotLabel.mockResolvedValue({ id: 'user-2' });

    await controller.applyBotLabel('user-2', 'automation', admin);
    await controller.clearBotLabel('user-2', admin);

    expect(mockService.applyBotLabel).toHaveBeenCalledWith(
      'admin-1',
      'user-2',
      'automation',
    );
    expect(mockService.clearBotLabel).toHaveBeenCalledWith('admin-1', 'user-2');
  });
});
