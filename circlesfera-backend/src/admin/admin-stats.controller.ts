import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
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
  @ApiResponse({ status: 200 })
  async getEnhancedStats() {
    return this.adminStatsService.getEnhancedStats();
  }

  // The home of the Backoffice has no permission of its own. The guard asks
  // for every permission a route lists, so each part of the week is a route
  // with the permission of its section: whoever may open one section gets
  // its part, and no other.
  @Get('overview/week/payments')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  async getOverviewWeekPayments() {
    return this.adminStatsService.getOverviewWeek({
      payments: true,
      support: false,
      promotions: false,
    });
  }

  @Get('overview/week/support')
  @RequireStaffPermissions('support')
  @ApiResponse({ status: 200 })
  async getOverviewWeekSupport() {
    return this.adminStatsService.getOverviewWeek({
      payments: false,
      support: true,
      promotions: false,
    });
  }

  @Get('overview/week/promotions')
  @RequireStaffPermissions('content')
  @ApiResponse({ status: 200 })
  async getOverviewWeekPromotions() {
    return this.adminStatsService.getOverviewWeek({
      payments: false,
      support: false,
      promotions: true,
    });
  }

  @Get('audit-logs/export')
  @RequireStaffPermissions('audit')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
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

  @ApiQuery({ name: 'days', required: false })
  @RequireStaffPermissions('users.read')
  @Get('stats/activity-chart')
  @ApiResponse({ status: 200 })
  async getActivityChart(@Query('days') daysStr?: string) {
    const days = daysStr ? parseInt(daysStr, 10) : 14;
    return this.adminStatsService.getActivityChart(days);
  }

  @RequireStaffPermissions('users.read')
  @Get('stats/top-users')
  @ApiResponse({ status: 200 })
  async getTopUsers() {
    return this.adminStatsService.getTopUsers();
  }

  @RequireStaffPermissions('payments')
  @Get('analytics/monetization')
  @ApiResponse({ status: 200, type: Object })
  async getMonetizationAnalytics() {
    return await this.adminStatsService.getMonetizationAnalytics();
  }

  // The recurring monthly income as kept day by day, newest first.
  @ApiQuery({ name: 'days', required: false })
  @RequireStaffPermissions('payments')
  @Get('analytics/monetization/history')
  @ApiResponse({ status: 200 })
  async getRecurringIncomeHistory(@Query('days') days?: string) {
    return this.recurringIncome.history(days ? Number(days) : undefined);
  }

  @RequireStaffPermissions('payments')
  @Get('payouts/stats')
  @ApiResponse({ status: 200 })
  async getPayoutStats() {
    return this.adminStatsService.getPayoutStats();
  }

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'search', required: false })
  @RequireStaffPermissions('payments')
  @Get('payouts')
  @ApiResponse({ status: 200 })
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
  @ApiResponse({ status: 200 })
  async getTransactions(@Query() query: AdminQueryDto) {
    return this.adminStatsService.getTransactions(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
      query.search,
    );
  }
}
