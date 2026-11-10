import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminMonetizationProgrammeService } from './admin-monetization-programme.service.js';
import {
  ListMonetizationApplicationsDto,
  MonetizationDecisionDto,
} from './dto/monetization-decision.dto.js';

// The monetization programme in the Admin Panel: staff with the payments
// permission read applications and approve, refuse or revoke them.
@Controller('admin/monetization/applications')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminMonetizationProgrammeController {
  constructor(
    @Inject(AdminMonetizationProgrammeService)
    private readonly programme: AdminMonetizationProgrammeService,
  ) {}

  @Get()
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  list(@Query() query: ListMonetizationApplicationsDto) {
    return this.programme.list(query.status, query.page);
  }

  @Patch(':profileId/approve')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  approve(
    @Param('profileId') profileId: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.programme.decide(admin.adminId, profileId, 'approve');
  }

  @Patch(':profileId/reject')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  reject(
    @Param('profileId') profileId: string,
    @Body() dto: MonetizationDecisionDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.programme.decide(admin.adminId, profileId, 'reject', dto.note);
  }

  @Patch(':profileId/revoke')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  revoke(
    @Param('profileId') profileId: string,
    @Body() dto: MonetizationDecisionDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.programme.decide(admin.adminId, profileId, 'revoke', dto.note);
  }
}
