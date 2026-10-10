import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminSubscriptionsService } from './admin-subscriptions.service.js';
import { AdminSubscriptionsQueryDto } from './dto/admin-subscriptions-query.dto.js';

@Controller('admin/subscriptions')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('payments')
export class AdminSubscriptionsController {
  constructor(
    @Inject(AdminSubscriptionsService)
    private readonly adminSubscriptionsService: AdminSubscriptionsService,
  ) {}

  @Get()
  async getSubscriptions(@Query() query: AdminSubscriptionsQueryDto) {
    return this.adminSubscriptionsService.getSubscriptions(
      query.page ?? 1,
      query.limit ?? 20,
      { status: query.status, planId: query.planId, search: query.search },
    );
  }
}
