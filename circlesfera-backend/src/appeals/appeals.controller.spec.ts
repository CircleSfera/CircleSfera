import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAdminData } from '../auth/decorators/current-admin.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { JwtOptionalGuard } from '../auth/guards/jwt-optional.guard.js';
import { AppealsController } from './appeals.controller.js';
import { AppealsService } from './appeals.service.js';

describe('AppealsController', () => {
  let controller: AppealsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockAdmin: CurrentAdminData = {
    adminId: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Staff',
    permissions: ['appeals'],
    roles: ['MODERATOR'],
    userId: 'admin-1',
  };

  const createDto = {
    targetType: 'ACCOUNT_BAN' as const,
    reason: 'Please review this ban',
  };

  const mockService = {
    create: vi.fn(),
    findMyUserAppeals: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
  };

  const mockJwt = {
    verify: vi.fn(),
  };

  const mockConfig = {
    get: vi.fn().mockReturnValue('test-jwt-secret'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppealsController],
      providers: [
        { provide: AppealsService, useValue: mockService },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtOptionalGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AppealsController>(AppealsController);
    vi.clearAllMocks();
    mockConfig.get.mockReturnValue('test-jwt-secret');
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates an appeal as the JWT userId when present', async () => {
    mockService.create.mockResolvedValue({ id: 'appeal-1' });

    await controller.create(
      { user: mockUser, headers: {}, body: {} },
      createDto,
    );

    expect(mockJwt.verify).not.toHaveBeenCalled();
    expect(mockService.create).toHaveBeenCalledWith('user-1', createDto);
  });

  it('creates an appeal from an x-appeal-token payload', async () => {
    mockJwt.verify.mockReturnValue({ isAppealToken: true, sub: 'banned-1' });
    mockService.create.mockResolvedValue({ id: 'appeal-1' });

    await controller.create(
      { headers: { 'x-appeal-token': 'token-1' }, body: {} },
      createDto,
    );

    expect(mockJwt.verify).toHaveBeenCalledWith('token-1', {
      secret: 'test-jwt-secret',
    });
    expect(mockService.create).toHaveBeenCalledWith('banned-1', createDto);
  });

  it('creates an appeal from a body appealToken when the header is absent', async () => {
    mockJwt.verify.mockReturnValue({ isAppealToken: true, sub: 'banned-2' });
    mockService.create.mockResolvedValue({ id: 'appeal-1' });

    await controller.create(
      { headers: {}, body: { appealToken: 'token-2' } },
      createDto,
    );

    expect(mockJwt.verify).toHaveBeenCalledWith('token-2', {
      secret: 'test-jwt-secret',
    });
    expect(mockService.create).toHaveBeenCalledWith('banned-2', createDto);
  });

  it('rejects an invalid appeal token', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('expired');
    });

    expect(() =>
      controller.create(
        { headers: { 'x-appeal-token': 'bad-token' }, body: {} },
        createDto,
      ),
    ).toThrow(UnauthorizedException);
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('rejects create without JWT user or appeal token', () => {
    expect(() =>
      controller.create({ headers: {}, body: {} }, createDto),
    ).toThrow(UnauthorizedException);
    expect(mockService.create).not.toHaveBeenCalled();
  });

  it('lists the caller appeals by userId', async () => {
    mockService.findMyUserAppeals.mockResolvedValue([]);

    await controller.findMyUserAppeals(mockUser);

    expect(mockService.findMyUserAppeals).toHaveBeenCalledWith('user-1');
  });

  it('lists admin appeals with default and parsed pagination', async () => {
    mockService.findAll.mockResolvedValue({ data: [] });

    await controller.findAll();
    await controller.findAll('2', '10', 'PENDING');

    expect(mockService.findAll).toHaveBeenNthCalledWith(1, 1, 20, undefined);
    expect(mockService.findAll).toHaveBeenNthCalledWith(2, 2, 10, 'PENDING');
  });

  it('updates an appeal as the staff adminId', async () => {
    const dto = { status: 'APPROVED' as const };
    mockService.update.mockResolvedValue({ id: 'appeal-1' });

    await controller.update('appeal-1', dto, mockAdmin);

    expect(mockService.update).toHaveBeenCalledWith('appeal-1', dto, 'admin-1');
  });
});
