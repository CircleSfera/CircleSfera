import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { RecurringIncomeService } from './recurring-income.service.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminStatsController {
  constructor(
    @Inject(AdminStatsService)
    private readonly adminStatsService: AdminStatsService,
    @Inject(RecurringIncomeService)
    private readonly recurringIncome: RecurringIncomeService,
  ) {}

  @RequireStaffPermissions('users.read')
  @Get('stats/enhanced')
  async getEnhancedStats() {
    return this.adminStatsService.getEnhancedStats();
  }

  // The home of the Backoffice has no permission of its own. The guard asks
  // for every permission a route lists, so each part of the week is a route
  // with the permission of its section: whoever may open one section gets
  // its part, and no other.
  @Get('overview/week/payments')
  @RequireStaffPermissions('payments')
  async getOverviewWeekPayments() {
    return this.adminStatsService.getOverviewWeek({
      payments: true,
      support: false,
      promotions: false,
    });
  }

  @Get('overview/week/support')
  @RequireStaffPermissions('support')
  async getOverviewWeekSupport() {
    return this.adminStatsService.getOverviewWeek({
      payments: false,
      support: true,
      promotions: false,
    });
  }

  @Get('overview/week/promotions')
  @RequireStaffPermissions('content')
  async getOverviewWeekPromotions() {
    return this.adminStatsService.getOverviewWeek({
      payments: false,
      support: false,
      promotions: true,
    });
  }

  @Get('audit-logs/export')
  @RequireStaffPermissions('audit')
  async exportAuditLogs(
    @Query() query: AdminQueryDto,
    @CurrentAdmin() admin: CurrentAdminData,
    @Res() res: Response,
  ) {
    const csv = await this.adminStatsService.exportAuditLogsCSV(admin.adminId, {
      action: query.action,
      search: query.search,
      from: query.from,
      to: query.to,
      adminId: query.adminId,
      targetId: query.userId,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=circlesfera-audit-log.csv',
    );
    res.send(csv);
  }

  @Get('audit-logs')
  @RequireStaffPermissions('audit')
  async getAuditLogs(@Query() query: AdminQueryDto) {
    return this.adminStatsService.getAuditLogs(
      query.page ?? 1,
      query.limit ?? 20,
      {
        action: query.action,
        search: query.search,
        from: query.from,
        to: query.to,
        adminId: query.adminId,
        // The account acted on.
        targetId: query.userId,
      },
    );
  }

  @RequireStaffPermissions('users.read')
  @Get('stats/activity-chart')
  async getActivityChart(@Query('days') daysStr?: string) {
    const days = daysStr ? parseInt(daysStr, 10) : 14;
    return this.adminStatsService.getActivityChart(days);
  }

  @RequireStaffPermissions('users.read')
  @Get('stats/top-users')
  async getTopUsers() {
    return this.adminStatsService.getTopUsers();
  }

  @RequireStaffPermissions('payments')
  @Get('analytics/monetization')
  async getMonetizationAnalytics() {
    return await this.adminStatsService.getMonetizationAnalytics();
  }

  // The recurring monthly income as kept day by day, newest first.
  @RequireStaffPermissions('payments')
  @Get('analytics/monetization/history')
  async getRecurringIncomeHistory(@Query('days') days?: string) {
    return this.recurringIncome.history(days ? Number(days) : undefined);
  }

  @RequireStaffPermissions('payments')
  @Get('payouts/stats')
  async getPayoutStats() {
    return this.adminStatsService.getPayoutStats();
  }

  @RequireStaffPermissions('payments')
  @Get('payouts')
  async getPayouts(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminStatsService.getPayouts(+page, +limit, status, search);
  }

  @Get('transactions')
  @RequireStaffPermissions('payments')
  async getTransactions(@Query() query: AdminQueryDto) {
    return this.adminStatsService.getTransactions(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
      query.search,
    );
  }
}
