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
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AdminGuard,
  RequireStaffPermissions,
} from '../auth/guards/admin.guard.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import { AdminQueryDto } from './dto/admin-query.dto.js';
import { BroadcastEmailDto } from './dto/broadcast-email.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateWhitelistEntryDto } from './dto/update-whitelist-entry.dto.js';

interface AuthRequest extends Request {
  user: { userId: string; email: string; role: string };
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(
    @Inject(AdminUsersService)
    private readonly adminUsersService: AdminUsersService,
  ) {}

  @Post('broadcast')
  @RequireStaffPermissions('system')
  async sendBroadcast(@Body() dto: BroadcastEmailDto, @Req() req: AuthRequest) {
    return this.adminUsersService.sendBroadcastEmail(req.user.userId, dto);
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
  async banUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.banUser(req.user.userId, id);
  }

  @Patch('users/:id/unban')
  @RequireStaffPermissions('users.ban')
  async unbanUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.unbanUser(req.user.userId, id);
  }

  @Patch('users/:id/role')
  @RequireStaffPermissions('users.write')
  async updateUserRole(
    @Param('id') id: string,
    @Body() data: { role: string },
    @Req() req: AuthRequest,
  ) {
    return this.adminUsersService.updateUserRole(
      req.user.userId,
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
    @Req() req: AuthRequest,
  ) {
    return this.adminUsersService.updateUserStatus(req.user.userId, id, data);
  }

  @RequireStaffPermissions('users.write')
  @Post('users/:id/revoke-kyc')
  async revokeUserKYC(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.revokeUserKYC(req.user.userId, id);
  }

  @RequireStaffPermissions('users.write')
  @Post('users/:id/sync-kyc')
  async syncUserKYC(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.syncUserKYC(req.user.userId, id);
  }

  @RequireStaffPermissions('users.ban')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.deleteUser(req.user.userId, id);
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
  @Patch('whitelist/:id')
  async updateWhitelist(
    @Param('id') id: string,
    @Body() data: UpdateWhitelistEntryDto,
    @Req() req: AuthRequest,
  ) {
    return this.adminUsersService.updateWhitelist(req.user.userId, id, data);
  }

  @RequireStaffPermissions('users.write')
  @Delete('whitelist/:id')
  async deleteWhitelist(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.deleteWhitelist(req.user.userId, id);
  }

  @Patch('users/:id/warn')
  @RequireStaffPermissions('users.ban')
  async warnUser(
    @Param('id') id: string,
    @Body('reason') reason: string | undefined,
    @Req() req: AuthRequest,
  ) {
    return this.adminUsersService.warnUser(req.user.userId, id, reason);
  }

  @Patch('users/:id/suspend')
  @RequireStaffPermissions('users.ban')
  async suspendUser(
    @Param('id') id: string,
    @Body() body: { days?: number; reason?: string },
    @Req() req: AuthRequest,
  ) {
    return this.adminUsersService.suspendUser(
      req.user.userId,
      id,
      body.days ?? 7,
      body.reason,
    );
  }

  @Patch('users/:id/restore')
  @RequireStaffPermissions('users.ban')
  async restoreSuspendedUser(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.adminUsersService.restoreUser(req.user.userId, id);
  }

  @RequireStaffPermissions('users.read')
  @Get('users/:id/detail')
  async getUserDetail(@Param('id') id: string) {
    return this.adminUsersService.getUserDetail(id);
  }
}
