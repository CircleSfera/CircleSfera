import {
  Body,
  Controller,
  Inject,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentAdmin,
  type CurrentAdminData,
} from '../auth/decorators/current-admin.decorator.js';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminProfileSuspensionService } from './admin-profile-suspension.service.js';
import { SuspendProfileDto } from './dto/suspend-profile.dto.js';

@Controller('admin/profiles')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminProfileSuspensionController {
  constructor(
    @Inject(AdminProfileSuspensionService)
    private readonly suspensions: AdminProfileSuspensionService,
  ) {}

  @Patch(':profileId/suspend')
  @RequireStaffPermissions('users.ban')
  suspend(
    @Param('profileId') profileId: string,
    @Body() dto: SuspendProfileDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.suspensions.suspend(admin.adminId, profileId, dto);
  }

  @Patch(':profileId/lift-suspension')
  @RequireStaffPermissions('users.ban')
  lift(
    @Param('profileId') profileId: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.suspensions.lift(admin.adminId, profileId);
  }
}
