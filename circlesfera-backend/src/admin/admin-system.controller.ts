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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminService } from './admin.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminSystemController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @RequireStaffPermissions('users.read')
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  async getStats() {
    return this.adminService.getStats();
  }

  @RequireStaffPermissions('system')
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async getSystemHealth() {
    return this.adminService.getSystemHealth();
  }

  @RequireStaffPermissions('moderation')
  @Get('firewall/rules')
  async getFirewallRules(@Query() query: AdminQueryDto) {
    return this.adminService.getFirewallRules(
      query.page ?? 1,
      query.limit ?? 20,
      query.search,
    );
  }

  @RequireStaffPermissions('moderation')
  @Post('firewall/rules')
  async addFirewallRule(
    @Body() body: { keyword: string; action: any; isActive?: boolean },
    @Req() req: AuthRequest,
  ) {
    return this.adminService.createFirewallRule(req.user.userId, body);
  }

  @RequireStaffPermissions('moderation')
  @Patch('firewall/rules/:id')
  async updateFirewallRule(
    @Param('id') id: string,
    @Body() body: { action?: any; isActive?: boolean },
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateFirewallRule(req.user.userId, id, body);
  }

  @RequireStaffPermissions('moderation')
  @Delete('firewall/rules/:id')
  async deleteFirewallRule(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminService.deleteFirewallRule(req.user.userId, id);
  }

  @Get('settings')
  @RequireStaffPermissions('system')
  async getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Patch('settings')
  @RequireStaffPermissions('system')
  async updateSystemSettings(
    @Body() body: {
      updates: { key: string; value: string; description?: string }[];
    },
    @Req() req: AuthRequest,
  ) {
    return this.adminService.updateSystemSettings(
      req.user.userId,
      body.updates,
    );
  }
}
