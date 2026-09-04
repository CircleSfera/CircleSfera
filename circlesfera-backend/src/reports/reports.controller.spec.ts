import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ReportReason, ReportTargetType } from './dto/create-report.dto.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

describe('ReportsController', () => {
  let controller: ReportsController;

  const mockUser: CurrentUserData = {
    userId: 'user-1',
    email: 'test@example.com',
    role: 'USER',
    profileId: 'profile-1',
  };

  const mockService = {
    create: vi.fn(),
    findMyReports: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ReportsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ReportsController>(ReportsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('files a report as the caller profile', async () => {
    const dto = {
      targetType: ReportTargetType.POST,
      targetId: 'post-1',
      reason: ReportReason.SPAM,
    };
    mockService.create.mockResolvedValue({ id: 'report-1' });

    await controller.create(mockUser, dto);

    expect(mockService.create).toHaveBeenCalledWith('profile-1', dto);
  });

  it('lists the caller reports with pagination', async () => {
    const pagination = { page: 1, limit: 10 };
    mockService.findMyReports.mockResolvedValue({ data: [] });

    await controller.findMyReports(mockUser, pagination);

    expect(mockService.findMyReports).toHaveBeenCalledWith(
      'profile-1',
      pagination,
    );
  });

  it('lists all reports without a reporter profile', async () => {
    const pagination = { page: 1, limit: 10 };
    mockService.findAll.mockResolvedValue({ data: [] });

    await controller.findAll(pagination);

    expect(mockService.findAll).toHaveBeenCalledWith(pagination);
  });

  it('updates a report status as the staff profile', async () => {
    mockService.update.mockResolvedValue({
      id: 'report-1',
      status: 'REVIEWING',
    });

    await controller.update('report-1', 'REVIEWING', mockUser);

    expect(mockService.update).toHaveBeenCalledWith(
      'report-1',
      'REVIEWING',
      'profile-1',
    );
  });
});
