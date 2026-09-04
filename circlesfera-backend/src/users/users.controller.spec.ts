import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { DataExportService } from './data-export.service.js';
import { VisibilityDto } from './dto/update-settings.dto.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

describe('UsersController', () => {
  let controller: UsersController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockUsersService = {
    getSuggestions: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    deleteUser: vi.fn(),
    scheduleDeletion: vi.fn(),
    cancelScheduledDeletion: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    createIdentitySession: vi.fn(),
    syncIdentitySession: vi.fn(),
  };

  const mockExportService = {
    requestDataExport: vi.fn(),
    getExportHistory: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: mockUsersService },
        { provide: DataExportService, useValue: mockExportService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('loads suggestions as the caller userId with default and parsed limit', async () => {
    mockUsersService.getSuggestions.mockResolvedValue([]);

    await controller.getSuggestions(mockUser);
    await controller.getSuggestions(mockUser, '5');

    expect(mockUsersService.getSuggestions).toHaveBeenNthCalledWith(
      1,
      'user-1',
      10,
    );
    expect(mockUsersService.getSuggestions).toHaveBeenNthCalledWith(
      2,
      'user-1',
      5,
    );
  });

  it('bans and unbans by user id without a staff identity', async () => {
    mockUsersService.banUser.mockResolvedValue({ id: 'user-2' });
    mockUsersService.unbanUser.mockResolvedValue({ id: 'user-2' });

    await controller.banUser('user-2');
    await controller.unbanUser('user-2');

    expect(mockUsersService.banUser).toHaveBeenCalledWith('user-2');
    expect(mockUsersService.unbanUser).toHaveBeenCalledWith('user-2');
  });

  it('requests and lists GDPR exports as the caller userId', async () => {
    mockExportService.requestDataExport.mockResolvedValue({ id: 'export-1' });
    mockExportService.getExportHistory.mockResolvedValue([]);

    await controller.requestDataExport(mockUser);
    await controller.getExportHistory(mockUser);

    expect(mockExportService.requestDataExport).toHaveBeenCalledWith('user-1');
    expect(mockExportService.getExportHistory).toHaveBeenCalledWith('user-1');
  });

  it('deletes the account as the caller userId', async () => {
    mockUsersService.deleteUser.mockResolvedValue(undefined);

    const result = await controller.deleteAccount(mockUser);

    expect(mockUsersService.deleteUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ message: 'Account deleted successfully' });
  });

  it('schedules and cancels deletion as the caller userId', async () => {
    const when = new Date('2026-10-04T00:00:00.000Z');
    mockUsersService.scheduleDeletion.mockResolvedValue(when);
    mockUsersService.cancelScheduledDeletion.mockResolvedValue({ ok: true });

    const scheduled = await controller.deleteMe(mockUser);
    await controller.restoreMe(mockUser);

    expect(mockUsersService.scheduleDeletion).toHaveBeenCalledWith('user-1');
    expect(mockUsersService.cancelScheduledDeletion).toHaveBeenCalledWith(
      'user-1',
    );
    expect(scheduled).toEqual({
      success: true,
      message: 'Account scheduled for deletion',
      scheduled_deletion_at: when.toISOString(),
    });
  });

  it('reads and updates settings as the caller userId', async () => {
    const dto = { privacyLevel: VisibilityDto.FOLLOWERS };
    mockUsersService.getSettings.mockResolvedValue({});
    mockUsersService.updateSettings.mockResolvedValue({});

    await controller.getSettings(mockUser);
    await controller.updateSettings(mockUser, dto);

    expect(mockUsersService.getSettings).toHaveBeenCalledWith('user-1');
    expect(mockUsersService.updateSettings).toHaveBeenCalledWith('user-1', dto);
  });

  it('starts identity verification as the caller userId with an explicit returnUrl', async () => {
    mockUsersService.createIdentitySession.mockResolvedValue({
      url: 'https://example.com/verify',
    });

    await controller.createIdentitySession(mockUser, {
      returnUrl: 'https://example.com/return',
    });

    expect(mockUsersService.createIdentitySession).toHaveBeenCalledWith(
      'user-1',
      'https://example.com/return',
    );
  });

  it('starts identity verification with the frontend account fallback', async () => {
    mockUsersService.createIdentitySession.mockResolvedValue({
      url: 'https://example.com/verify',
    });
    const fallback = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/accounts/account`;

    await controller.createIdentitySession(mockUser, {});

    expect(mockUsersService.createIdentitySession).toHaveBeenCalledWith(
      'user-1',
      fallback,
    );
  });

  it('syncs identity verification as the caller userId', async () => {
    mockUsersService.syncIdentitySession.mockResolvedValue({ status: 'ok' });

    await controller.syncIdentitySession(mockUser);

    expect(mockUsersService.syncIdentitySession).toHaveBeenCalledWith('user-1');
  });
});
