import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminCompaniesService } from './admin-companies.service.js';
import { AdminCompaniesQueryDto } from './dto/admin-companies-query.dto.js';

@Controller('admin/companies')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('payments')
export class AdminCompaniesController {
  constructor(
    @Inject(AdminCompaniesService)
    private readonly adminCompaniesService: AdminCompaniesService,
  ) {}

  @Get()
  @ApiResponse({ status: 200 })
  async getCompanies(@Query() query: AdminCompaniesQueryDto) {
    return this.adminCompaniesService.getCompanies(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }
}
