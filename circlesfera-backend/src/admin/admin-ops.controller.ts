import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
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
  RequireAdminStepUp,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { AdminJwtAuthGuard } from '../auth/guards/admin-jwt-auth.guard.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { AddFirewallSignatureDto } from './dto/firewall.dto.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminOpsController {
  constructor(
    @Inject(AdminOpsService)
    private readonly adminOpsService: AdminOpsService,
  ) {}

  @RequireStaffPermissions('moderation')
  @Get('firewall')
  @ApiResponse({ status: 200 })
  async getFirewallSignatures(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getFirewallSignatures(
      query.page ?? 1,
      query.limit ?? 20,
    );
  }

  @RequireStaffPermissions('moderation')
  @Post('firewall')
  @ApiResponse({ status: 201 })
  async addFirewallSignature(
    @Body() body: AddFirewallSignatureDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.addFirewallSignature(
      admin.adminId,
      body.text,
      body.category,
    );
  }

  @RequireStaffPermissions('moderation')
  @RequireAdminStepUp()
  @Delete('firewall/:id')
  @ApiResponse({ status: 200 })
  async deleteFirewallSignature(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.deleteFirewallSignature(admin.adminId, id);
  }

  @RequireStaffPermissions('experiments')
  @Get('experiments/users')
  @ApiResponse({ status: 200 })
  async getUserExperiments(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getUserExperiments(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  @RequireStaffPermissions('experiments')
  @Post('experiments/users')
  @ApiResponse({ status: 201, type: Object })
  async assignUserExperiment(
    @Body() body: { userId: string; experimentKey: string; variant: string },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.assignUserExperiment(
      admin.adminId,
      body.userId,
      body.experimentKey,
      body.variant,
    );
  }

  @RequireStaffPermissions('experiments')
  @Delete('experiments/users/:id')
  @ApiResponse({ status: 200 })
  async removeUserExperiment(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.removeUserExperiment(admin.adminId, id);
  }

  @Get('feature-flags')
  @RequireStaffPermissions('experiments')
  @ApiResponse({ status: 200 })
  async listFeatureFlags() {
    return this.adminOpsService.listFeatureFlags();
  }

  @Put('feature-flags/:key')
  @RequireStaffPermissions('experiments')
  @RequireAdminStepUp()
  @ApiResponse({ status: 200 })
  async upsertFeatureFlag(
    @Param('key') key: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isEnabled?: boolean;
      percentage?: number;
    },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.upsertFeatureFlag(admin.adminId, {
      key,
      ...body,
    });
  }

  @Delete('feature-flags/:key')
  @RequireStaffPermissions('experiments')
  @RequireAdminStepUp()
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async deleteFeatureFlag(
    @Param('key') key: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.deleteFeatureFlag(admin.adminId, key);
  }

  @Get('webhooks')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  async getWebhookEvents(@Query() query: AdminQueryDto) {
    return this.adminOpsService.getWebhookEvents(
      query.page ?? 1,
      query.limit ?? 20,
      query.status,
    );
  }

  @Get('webhooks/:id')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 200 })
  async getWebhookEvent(@Param('id') id: string) {
    return this.adminOpsService.getWebhookEvent(id);
  }

  @Post('webhooks/:id/replay')
  @RequireStaffPermissions('payments')
  @ApiResponse({ status: 201, type: Object })
  async replayWebhookEvent(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminOpsService.replayWebhookEvent(admin.adminId, id);
  }
}
