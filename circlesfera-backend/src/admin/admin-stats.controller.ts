import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminStatsService } from './admin-stats.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminStatsController {
  constructor(
    @Inject(AdminStatsService)
    private readonly adminStatsService: AdminStatsService,
  ) {}

  @RequireStaffPermissions('users.read')
  @Get('stats/enhanced')
  async getEnhancedStats() {
    return this.adminStatsService.getEnhancedStats();
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
