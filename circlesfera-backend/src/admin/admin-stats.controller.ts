import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
  staffHoldsPermission,
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

  // The home of the Backoffice has no permission of its own: whoever may
  // open one of its sections gets the parts of those sections, and no other.
  @Get('overview/week')
  @RequireStaffPermissions('payments', 'support', 'content')
  async getOverviewWeek(@CurrentAdmin() admin: CurrentAdminData) {
    return this.adminStatsService.getOverviewWeek({
      payments: staffHoldsPermission(admin, 'payments'),
      support: staffHoldsPermission(admin, 'support'),
      promotions: staffHoldsPermission(admin, 'content'),
    });
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
