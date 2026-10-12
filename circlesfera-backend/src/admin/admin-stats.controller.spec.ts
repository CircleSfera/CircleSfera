import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AdminGuard } from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import {
  ADMIN_BEARER,
  BEARER,
  createControllerApp,
  TEST_ADMIN,
} from '../common/testing/http-controller.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { AdminStatsService } from './admin-stats.service.js';
import { RecurringIncomeService } from './recurring-income.service.js';

describe('AdminStatsController', () => {
  let app: INestApplication;

  const mockService = {
    getEnhancedStats: vi.fn(),
    getAuditLogs: vi.fn(),
    exportAuditLogsCSV: vi.fn(),
    getOverviewWeek: vi.fn(),
    getActivityChart: vi.fn(),
    getTopUsers: vi.fn(),
    getMonetizationAnalytics: vi.fn(),
    getPayoutStats: vi.fn(),
    getPayouts: vi.fn(),
    getTransactions: vi.fn(),
  };

  const recurringIncome = { history: vi.fn() };

  beforeAll(async () => {
    app = await createControllerApp({
      controllers: [AdminStatsController],
      providers: [
        { provide: AdminStatsService, useValue: mockService },
        { provide: RecurringIncomeService, useValue: recurringIncome },
      ],
      guards: [
        { guard: AdminJwtAuthGuard, mode: 'admin' },
        { guard: AdminGuard, mode: 'allow' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects enhanced stats without credentials', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/enhanced')
      .expect(401);

    expect(mockService.getEnhancedStats).not.toHaveBeenCalled();
  });

  it('rejects enhanced stats with a user session', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/enhanced')
      .set(BEARER)
      .expect(401);

    expect(mockService.getEnhancedStats).not.toHaveBeenCalled();
  });

  it('reads stats, top users, monetization and payout stats', async () => {
    mockService.getEnhancedStats.mockResolvedValue({});
    mockService.getTopUsers.mockResolvedValue([]);
    mockService.getMonetizationAnalytics.mockResolvedValue({});
    mockService.getPayoutStats.mockResolvedValue({});

    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/enhanced')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/top-users')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/monetization')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/payouts/stats')
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getEnhancedStats).toHaveBeenCalledWith();
    expect(mockService.getTopUsers).toHaveBeenCalledWith();
    expect(mockService.getMonetizationAnalytics).toHaveBeenCalledWith();
    expect(mockService.getPayoutStats).toHaveBeenCalledWith();
  });

  it('reads the recurring income kept day by day, for the days asked or the usual ones', async () => {
    recurringIncome.history.mockResolvedValue({ days: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/monetization/history')
      .set(ADMIN_BEARER)
      .expect(200, { days: [] });
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/monetization/history')
      .query({ days: 7 })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/analytics/monetization/history')
      .expect(401);

    expect(recurringIncome.history.mock.calls).toEqual([[undefined], [7]]);
  });

  it('filters the audit log by the staff member and by the account acted on', async () => {
    mockService.getAuditLogs.mockResolvedValue({ data: [] });
    const staff = '11111111-1111-4111-8111-111111111111';
    const account = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ adminId: staff, userId: account })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({ adminId: 'not-an-id' })
      .set(ADMIN_BEARER)
      .expect(400);

    expect(mockService.getAuditLogs).toHaveBeenCalledTimes(1);
    expect(mockService.getAuditLogs).toHaveBeenCalledWith(
      1,
      10,
      expect.objectContaining({ adminId: staff, targetId: account }),
    );
  });

  it.each([
    ['payments', { payments: true, support: false, promotions: false }],
    ['support', { payments: false, support: true, promotions: false }],
    ['promotions', { payments: false, support: false, promotions: true }],
  ])(
    'answers the %s part of the week of the Backoffice home, and no other',
    async (part, asked) => {
      mockService.getOverviewWeek.mockResolvedValue({ part });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/overview/week/${part}`)
        .set(ADMIN_BEARER)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/overview/week/${part}`)
        .expect(401);

      expect(res.body).toEqual({ part });
      expect(mockService.getOverviewWeek).toHaveBeenCalledTimes(1);
      expect(mockService.getOverviewWeek).toHaveBeenCalledWith(asked);
    },
  );

  it('hands the audit log as a file, with the filters asked and as adminId', async () => {
    mockService.exportAuditLogsCSV.mockResolvedValue('Date\n"x"');
    const account = '22222222-2222-4222-8222-222222222222';

    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs/export')
      .query({ action: 'BAN_USER', userId: account })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs/export')
      .expect(401);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain(
      'circlesfera-audit-log.csv',
    );
    expect(res.text).toBe('Date\n"x"');
    expect(mockService.exportAuditLogsCSV).toHaveBeenCalledTimes(1);
    expect(mockService.exportAuditLogsCSV).toHaveBeenCalledWith(
      TEST_ADMIN.adminId,
      expect.objectContaining({ action: 'BAN_USER', targetId: account }),
    );
  });

  it('lists audit logs with default pagination and filters', async () => {
    mockService.getAuditLogs.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .query({
        page: 2,
        limit: 10,
        action: 'BAN_USER',
        search: 'ada',
        from: '2026-01-01',
        to: '2026-01-31',
      })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getAuditLogs).toHaveBeenNthCalledWith(1, 1, 10, {
      action: undefined,
      search: undefined,
      from: undefined,
      to: undefined,
      adminId: undefined,
      targetId: undefined,
    });
    expect(mockService.getAuditLogs).toHaveBeenNthCalledWith(2, 2, 10, {
      action: 'BAN_USER',
      search: 'ada',
      from: '2026-01-01',
      to: '2026-01-31',
      adminId: undefined,
      targetId: undefined,
    });
  });

  it('loads the activity chart with default and parsed days', async () => {
    mockService.getActivityChart.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/activity-chart')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats/activity-chart')
      .query({ days: '7' })
      .set(ADMIN_BEARER)
      .expect(200);

    expect(mockService.getActivityChart).toHaveBeenNthCalledWith(1, 14);
    expect(mockService.getActivityChart).toHaveBeenNthCalledWith(2, 7);
  });

  it('lists payouts and transactions with defaults', async () => {
    mockService.getPayouts.mockResolvedValue({ data: [] });
    mockService.getTransactions.mockResolvedValue({ data: [] });

    await request(app.getHttpServer())
      .get('/api/v1/admin/payouts')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/payouts')
      .query({ page: 2, limit: 10, status: 'paid', search: 'ada' })
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/transactions')
      .set(ADMIN_BEARER)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/transactions')
      .query({
        page: 3,
        limit: 15,
        status: 'COMPLETED',
        search: 'tip',
      })
      .set(ADMIN_BEARER)
      .expect(200);

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
      10,
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
