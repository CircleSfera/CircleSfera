import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
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
import { AdminService } from './admin.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import {
  CreateFirewallRuleDto,
  UpdateFirewallRuleDto,
} from './dto/firewall.dto.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminSystemController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @RequireStaffPermissions('users.read')
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async getStats() {
    return this.adminService.getStats();
  }

  @RequireStaffPermissions('system')
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiResponse({ status: HttpStatus.OK })
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @RequireStaffPermissions('moderation')
  @Get('firewall/rules')
  @ApiResponse({ status: 200 })
  async getFirewallRules(@Query() query: AdminQueryDto) {
    return this.adminService.getFirewallRules(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  @RequireStaffPermissions('moderation')
  @RequireAdminStepUp()
  @Post('firewall/rules')
  @ApiResponse({ status: 201 })
  async addFirewallRule(
    @Body() body: CreateFirewallRuleDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminService.createFirewallRule(admin.adminId, body);
  }

  @RequireStaffPermissions('moderation')
  @Patch('firewall/rules/:id')
  @ApiResponse({ status: 200 })
  async updateFirewallRule(
    @Param('id') id: string,
    @Body() body: UpdateFirewallRuleDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminService.updateFirewallRule(admin.adminId, id, body);
  }

  @RequireStaffPermissions('moderation')
  @RequireAdminStepUp()
  @Delete('firewall/rules/:id')
  @ApiResponse({ status: 200 })
  async deleteFirewallRule(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminService.deleteFirewallRule(admin.adminId, id);
  }

  @Get('settings')
  @RequireStaffPermissions('system')
  @ApiResponse({ status: 200 })
  async getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Patch('settings')
  @RequireStaffPermissions('system')
  @ApiResponse({ status: 200 })
  async updateSystemSettings(
    @Body() body: {
      updates: { key: string; value: string; description?: string }[];
    },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminService.updateSystemSettings(admin.adminId, body.updates);
  }
}
