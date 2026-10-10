import {
  Body,
  Controller,
  Get,
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
  RequireAdminStepUp,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminPlansService } from './admin-plans.service.js';
import { UpdatePlanDto } from './dto/update-plan.dto.js';

@Controller('admin/plans')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
@RequireStaffPermissions('plans')
export class AdminPlansController {
  constructor(
    @Inject(AdminPlansService)
    private readonly adminPlansService: AdminPlansService,
  ) {}

  @Get()
  async getPlans() {
    return this.adminPlansService.getPlans();
  }

  @RequireAdminStepUp()
  @Patch(':id')
  async updatePlan(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminPlansService.updatePlan(admin.adminId, id, dto);
  }
}
