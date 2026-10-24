import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { RiskCaseStatus } from '@prisma/client';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminRiskCasesService } from './admin-risk-cases.service.js';
import { ResolveRiskCaseDto } from './dto/resolve-risk-case.dto.js';

const STATUSES: RiskCaseStatus[] = ['OPEN', 'DISMISSED', 'ACTIONED'];

// Spam and bot review queue for staff.
@Controller('admin/risk-cases')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminRiskCasesController {
  constructor(
    @Inject(AdminRiskCasesService)
    private readonly riskCases: AdminRiskCasesService,
  ) {}

  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @RequireStaffPermissions('users.read')
  @Get()
  @ApiResponse({ status: 200 })
  list(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = STATUSES.includes(status as RiskCaseStatus)
      ? (status as RiskCaseStatus)
      : 'OPEN';
    return this.riskCases.list(
      parsed,
      Number.parseInt(page ?? '1', 10) || 1,
      Number.parseInt(limit ?? '20', 10) || 20,
    );
  }

  @RequireStaffPermissions('users.read')
  @Get('stats')
  @ApiResponse({ status: 200 })
  stats() {
    return this.riskCases.stats();
  }

  @RequireStaffPermissions('users.ban')
  @Post(':id/resolve')
  @ApiResponse({ status: 201, type: Object })
  resolve(
    @Param('id') id: string,
    @Body() dto: ResolveRiskCaseDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.riskCases.resolve(admin.adminId, id, dto.decision, dto.note);
  }
}
