import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';

describe('AdminStatsController', () => {
  let controller: AdminStatsController;

  const mockService = {
    getEnhancedStats: vi.fn(),
    getAuditLogs: vi.fn(),
    getActivityChart: vi.fn(),
    getTopUsers: vi.fn(),
    getMonetizationAnalytics: vi.fn(),
    getPayoutStats: vi.fn(),
    getPayouts: vi.fn(),
    getTransactions: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminStatsController],
      providers: [{ provide: AdminStatsService, useValue: mockService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminStatsController>(AdminStatsController);
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reads stats, top users, monetization and payout stats without an actor', async () => {
    mockService.getEnhancedStats.mockResolvedValue({});
    mockService.getTopUsers.mockResolvedValue([]);
    mockService.getMonetizationAnalytics.mockResolvedValue({});
    mockService.getPayoutStats.mockResolvedValue({});

    await controller.getEnhancedStats();
    await controller.getTopUsers();
    await controller.getMonetizationAnalytics();
    await controller.getPayoutStats();

    expect(mockService.getEnhancedStats).toHaveBeenCalledWith();
    expect(mockService.getTopUsers).toHaveBeenCalledWith();
    expect(mockService.getMonetizationAnalytics).toHaveBeenCalledWith();
    expect(mockService.getPayoutStats).toHaveBeenCalledWith();
  });

  it('lists audit logs with default pagination and filters', async () => {
    mockService.getAuditLogs.mockResolvedValue({ data: [] });

    await controller.getAuditLogs({});
    await controller.getAuditLogs({
      page: 2,
      limit: 10,
      action: 'BAN_USER',
      search: 'ada',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(mockService.getAuditLogs).toHaveBeenNthCalledWith(1, 1, 20, {
      action: undefined,
      search: undefined,
      from: undefined,
      to: undefined,
    });
    expect(mockService.getAuditLogs).toHaveBeenNthCalledWith(2, 2, 10, {
      action: 'BAN_USER',
      search: 'ada',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });

  it('loads the activity chart with default and parsed days', async () => {
    mockService.getActivityChart.mockResolvedValue([]);

    await controller.getActivityChart();
    await controller.getActivityChart('7');

    expect(mockService.getActivityChart).toHaveBeenNthCalledWith(1, 14);
    expect(mockService.getActivityChart).toHaveBeenNthCalledWith(2, 7);
  });

  it('lists payouts and transactions with defaults', async () => {
    mockService.getPayouts.mockResolvedValue({ data: [] });
    mockService.getTransactions.mockResolvedValue({ data: [] });

    await controller.getPayouts();
    await controller.getPayouts(2, 10, 'paid', 'ada');
    await controller.getTransactions({});
    await controller.getTransactions({
      page: 3,
      limit: 15,
      status: 'COMPLETED',
      search: 'tip',
    });

    expect(mockService.getPayouts).toHaveBeenNthCalledWith(
      1,
      1,
      20,
      undefined,
      undefined,
    );
    expect(mockService.getPayouts).toHaveBeenNthCalledWith(
      2,
      2,
      10,
      'paid',
      'ada',
    );
    expect(mockService.getTransactions).toHaveBeenNthCalledWith(
      1,
      1,
      20,
      undefined,
      undefined,
    );
    expect(mockService.getTransactions).toHaveBeenNthCalledWith(
      2,
      3,
      15,
      'COMPLETED',
      'tip',
    );
  });
});
