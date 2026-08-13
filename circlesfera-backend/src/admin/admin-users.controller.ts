import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { AdminUsersService } from './admin-users.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { BroadcastEmailDto } from './dto/broadcast-email.dto.js';
import { CreateWhitelistEntryDto } from './dto/create-whitelist-entry.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateWhitelistEntryDto } from './dto/update-whitelist-entry.dto.js';

@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly adminUsersService: AdminUsersService,
  ) {}

  @Post('broadcast')
  @RequireStaffPermissions('system')
  async sendBroadcast(
    @Body() dto: BroadcastEmailDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.sendBroadcastEmail(admin.adminId, dto);
  }

  @RequireStaffPermissions('users.read')
  @Get('users/export')
  async exportUsersCSV(@Res() res: Response) {
    const csv = await this.adminUsersService.exportUsersCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=circlesfera-users.csv',
    );
    res.send(csv);
  }

  @RequireStaffPermissions('users.read')
  @Get('users')
  async getUsers(@Query() query: AdminQueryDto) {
    return this.adminUsersService.getUsers(
      query.page,
      query.limit,
      query.search,
      query.status,
      query.role,
      query.kycStatus,
    );
  }

  @RequireStaffPermissions('users.read')
  @Get('users/kyc/stats')
  async getKycStats() {
    return this.adminUsersService.getKycStats();
  }

  @Patch('users/:id/ban')
  @RequireStaffPermissions('users.ban')
  async banUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.banUser(admin.adminId, id);
  }

  @Patch('users/:id/unban')
  @RequireStaffPermissions('users.ban')
  async unbanUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.unbanUser(admin.adminId, id);
  }

  @Patch('users/:id/role')
  @RequireStaffPermissions('users.write')
  async updateUserRole(
    @Param('id') id: string,
    @Body() data: { role: string },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.updateUserRole(
      admin.adminId,
      id,
      data.role as any,
    );
  }

  @RequireStaffPermissions('users.write')
  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body()
    data: UpdateUserStatusDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.updateUserStatus(admin.adminId, id, data);
  }

  @RequireStaffPermissions('users.write')
  @Post('users/:id/revoke-kyc')
  async revokeUserKYC(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.revokeUserKYC(admin.adminId, id);
  }

  @RequireStaffPermissions('users.write')
  @Post('users/:id/sync-kyc')
  async syncUserKYC(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.syncUserKYC(admin.adminId, id);
  }

  @RequireStaffPermissions('users.ban')
  @RequireAdminStepUp()
  @Delete('users/:id')
  async deleteUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.deleteUser(admin.adminId, id);
  }

  @RequireStaffPermissions('users.read')
  @Get('whitelist')
  async getWhitelist(@Query() query: AdminQueryDto) {
    return this.adminUsersService.getWhitelist(
      query.page ?? 1,
      query.limit ?? 10,
      query.search,
    );
  }

  @RequireStaffPermissions('users.write')
  @Post('whitelist')
  async createWhitelist(
    @Body() data: CreateWhitelistEntryDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.createWhitelist(admin.adminId, data);
  }

  @RequireStaffPermissions('users.write')
  @Patch('whitelist/:id')
  async updateWhitelist(
    @Param('id') id: string,
    @Body() data: UpdateWhitelistEntryDto,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.updateWhitelist(admin.adminId, id, data);
  }

  @RequireStaffPermissions('users.write')
  @Delete('whitelist/:id')
  async deleteWhitelist(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.deleteWhitelist(admin.adminId, id);
  }

  @Patch('users/:id/warn')
  @RequireStaffPermissions('users.ban')
  async warnUser(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.warnUser(admin.adminId, id, reason);
  }

  @Patch('users/:id/suspend')
  @RequireStaffPermissions('users.ban')
  async suspendUser(
    @Param('id') id: string,
    @Body() body: { days?: number; reason?: string },
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.suspendUser(
      admin.adminId,
      id,
      body.days ?? 7,
      body.reason,
    );
  }

  @Patch('users/:id/restore')
  @RequireStaffPermissions('users.ban')
  async restoreSuspendedUser(
    @Param('id') id: string,
    @CurrentAdmin() admin: CurrentAdminData,
  ) {
    return this.adminUsersService.restoreUser(admin.adminId, id);
  }

  @RequireStaffPermissions('users.read')
  @Get('users/:id/detail')
  async getUserDetail(@Param('id') id: string) {
    return this.adminUsersService.getUserDetail(id);
  }
}
