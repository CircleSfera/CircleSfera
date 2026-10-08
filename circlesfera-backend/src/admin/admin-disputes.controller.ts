import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminDisputesService } from './admin-disputes.service.js';
import { AdminDisputesQueryDto } from './dto/admin-disputes-query.dto.js';

@Controller('admin/disputes')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('payments')
export class AdminDisputesController {
  constructor(
    @Inject(AdminDisputesService)
    private readonly adminDisputesService: AdminDisputesService,
  ) {}

  @Get()
  async getDisputes(@Query() query: AdminDisputesQueryDto) {
    return this.adminDisputesService.getDisputes(
      query.page ?? 1,
      query.limit ?? 20,
      query.state,
    );
  }
}
